import { deviceLoginChallenge } from '../services/deviceLogin.js';
import crypto from 'node:crypto';
import { verifySignupCaptcha } from '../services/captchaService.js';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { startSession, endSession } from '../utils/session.js';
import { sendVerificationEmail, confirmEmail } from '../services/verificationService.js';
import { sendResetEmail, resetPassword as applyNewPassword } from '../services/passwordResetService.js';
import { startEmailChange, peekEmailApproval, approveEmailChange, cancelEmailChange, finishEmailChange, dropEmailChange, deleteAccount } from '../services/accountService.js';
import { normaliseCode } from '../utils/albumCodes.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Compared against when the email is unknown, so a miss takes as long as a wrong password
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

function readCredentials(body, { needName }) {
  const name = String(body?.name ?? '').trim();
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (needName && !name) throw new HttpError(400, 'Enter your name so guests know who added each photo.');
  if (name.length > 80) throw new HttpError(400, 'Keep your name under 80 characters.');
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Enter an email address like name@example.com.');
  if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
  if (password.length > 128) throw new HttpError(400, 'Keep your password under 128 characters.');
  return { name, email, password };
}

function providerNames(user) {
  return user.googleId ? 'Google' : '';
}

async function signedIn(res, user, status = 200) {
  user.lastLoginAt = new Date();
  await user.save();
  try {
    await startSession(res, user);
  } catch (error) {
    if (error.code !== 'session_limit') throw error;
    return res.status(409).json({ code: 'session_limit', error: 'Three devices are logged in. Verify your email to replace one.', challenge: deviceLoginChallenge(user) });
  }
  res.status(status).json({ user: user.toPublic() });
}

// ---- Email and password ----

export async function signup(req, res) {
  await verifySignupCaptcha(req.body?.captchaToken, config.captcha);
  const { name, email, password } = readCredentials(req.body, { needName: true });
  const existing = await User.findOne({ email }).select('+passwordHash');
  if (existing) {
    if (!existing.passwordHash && providerNames(existing)) {
      throw new HttpError(409, `This email already has an account. Continue with ${providerNames(existing)} instead.`);
    }
    throw new HttpError(409, 'An account with this email already exists. Log in instead.');
  }
  const user = new User({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  // Signed up through an invite link: they're added to that album once their email is confirmed
  const joinCode = normaliseCode(req.body?.joinCode);
  if (joinCode.length === 7) user.pendingJoin = joinCode;
  try {
    await signedIn(res, user, 201);
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
    throw err;
  }
  // The confirm email goes out after the response, so a slow or failing mail server
  // never holds up or breaks signing up; the person can ask for another from My albums
  sendVerificationEmail(user).catch((err) => console.error(`Confirm email to ${user.email} failed: ${err.message}`));
}

export async function login(req, res) {
  const { email, password } = readCredentials(req.body, { needName: false });
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (user && !user.passwordHash && providerNames(user)) {
    throw new HttpError(401, `This account signs in with ${providerNames(user)}. Use that button above.`);
  }
  if (!user || !ok) throw new HttpError(401, 'That email and password don’t match an account.');
  await signedIn(res, user);
}

export async function logout(req, res) {
  await endSession(req, res);
  res.json({ ok: true });
}

export function me(req, res) {
  res.json({ user: req.user ? req.user.toPublic() : null });
}

export async function updateMe(req, res) {
  const name = req.body?.name;
  if (name !== undefined) {
    const n = String(name).trim();
    if (!n || n.length > 80) throw new HttpError(400, 'Enter a name up to 80 characters.');
    req.user.name = n;
  }
  // Email choices: only the three known switches, only true/false
  const notify = req.body?.notify;
  if (notify && typeof notify === 'object') {
    for (const key of ['photos', 'closing', 'recap']) {
      if (typeof notify[key] === 'boolean') req.user.set(`notify.${key}`, notify[key]);
    }
  }
  await req.user.save();
  res.json({ user: req.user.toPublic() });
}

// Accounts with a password confirm it before big changes, so a borrowed, logged-in browser
// can't take the account away. Google-only accounts have no password to give.
async function checkPassword(user, password) {
  if (!user.passwordHash) return;
  if (!password || !(await bcrypt.compare(String(password), user.passwordHash))) {
    throw new HttpError(401, 'That password isn’t right.');
  }
}

// ---- Changing the password from Settings, in three steps ----
// 1. POST /password/code     { currentPassword }        → a 6-digit code is emailed
// 2. POST /password/code/verify { code }                → a ticket (the code is used up)
// 3. POST /password          { ticket, newPassword, newPasswordAgain } → the password changes
// Every other login is then ended and this browser gets a fresh one.
// Google-only accounts have no password to change; the email must be confirmed first, so the code
// (and the "password changed" warning) reach the real owner.
const CODE_MINUTES = 10;
const TICKET_MINUTES = 10;
const MAX_CODE_TRIES = 5;
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length
  && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function canChangePassword(user) {
  if (!user.passwordHash) {
    throw new HttpError(400, `This account signs in with ${providerNames(user) || 'Google'}, so it has no password to change.`, 'no-password');
  }
  if (!user.emailVerified) {
    throw new HttpError(403, `Confirm your email first. We sent a link to ${user.email}; open it, then change your password.`, 'unverified');
  }
}

// Step 1: the current password, then a 6-digit code by email (a new one replaces any older one)
export async function startPasswordChange(req, res) {
  const user = req.user;
  canChangePassword(user);
  await checkPassword(user, req.body?.currentPassword);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await User.updateOne({ _id: user._id }, { $set: { passwordChange: {
    codeHash: sha256(`${user.id}:${code}`), codeExpiresAt: new Date(Date.now() + CODE_MINUTES * 60000), tries: 0,
  } } });
  const { sendEmail, isEmailConfigured } = await import('../services/emailService.js');
  const { passwordCodeHtml } = await import('../services/emailTemplates.js');
  if (!isEmailConfigured() && !config.isProduction) {
    console.log(`[email not set up] Password change code for ${user.email}: ${code}`);
  } else {
    await sendEmail({ to: user.email, subject: 'Your Momento code to change your password', html: passwordCodeHtml(user, code, CODE_MINUTES) });
  }
  res.json({ ok: true, sentTo: maskEmail(user.email), minutes: CODE_MINUTES });
}

// Step 2: the code from the email. Five wrong tries and a new code is needed.
export async function verifyPasswordCode(req, res) {
  const user = req.user;
  canChangePassword(user);
  const code = String(req.body?.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) throw new HttpError(400, 'Enter the 6-digit code from the email.', 'bad-code');
  // Count this try BEFORE comparing, in one atomic step: it only succeeds while the code is live and
  // has tries left, so many guesses sent at the same moment can't get past the limit
  const now = new Date();
  const counted = await User.findOneAndUpdate(
    { _id: user._id, 'passwordChange.codeHash': { $exists: true }, 'passwordChange.codeExpiresAt': { $gt: now }, 'passwordChange.tries': { $lt: MAX_CODE_TRIES } },
    { $inc: { 'passwordChange.tries': 1 } },
    { returnDocument: 'after' },
  ).select('+passwordChange');
  if (!counted) {
    const pc = (await User.findById(user._id).select('+passwordChange'))?.passwordChange;
    if (pc?.codeHash && pc.codeExpiresAt > now) throw new HttpError(429, 'Too many wrong codes. Send a new one.', 'code-expired');
    throw new HttpError(400, 'This code has expired. Send a new one.', 'code-expired');
  }
  const pc = counted.passwordChange;
  if (!sameHash(sha256(`${user.id}:${code}`), pc.codeHash)) {
    const left = MAX_CODE_TRIES - pc.tries;
    throw new HttpError(400, left > 0 ? `That code isn’t right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong codes. Send a new one.', left > 0 ? 'bad-code' : 'code-expired');
  }
  // Right code: use it up atomically (only if it's still this code), so two requests at the same
  // moment can't both get a ticket. The ticket lets the new password be set for a few minutes.
  const ticket = crypto.randomBytes(24).toString('base64url');
  const used = await User.updateOne({ _id: user._id, 'passwordChange.codeHash': pc.codeHash }, { $set: { passwordChange: {
    ticketHash: sha256(ticket), ticketExpiresAt: new Date(Date.now() + TICKET_MINUTES * 60000), tries: 0,
  } } });
  if (!used.modifiedCount) throw new HttpError(400, 'This code has already been used. Send a new one.', 'code-expired');
  res.json({ ticket, minutes: TICKET_MINUTES });
}

// Step 3: the new password, typed twice, different from the current one
export async function changePassword(req, res) {
  const user = req.user;
  canChangePassword(user);
  const ticket = String(req.body?.ticket ?? '');
  const pc = (await User.findById(user._id).select('+passwordChange'))?.passwordChange;
  if (!ticket || !pc?.ticketHash || !pc.ticketExpiresAt || pc.ticketExpiresAt < new Date() || !sameHash(sha256(ticket), pc.ticketHash)) {
    throw new HttpError(403, 'Confirm the code from your email first. If it’s been more than 10 minutes, start again.', 'code-needed');
  }
  const next = String(req.body?.newPassword ?? '');
  if (next !== String(req.body?.newPasswordAgain ?? '')) throw new HttpError(400, 'The two new passwords don’t match.', 'mismatch');
  if (next.length < 8) throw new HttpError(400, 'Use at least 8 characters for your new password.');
  if (next.length > 128) throw new HttpError(400, 'Keep your password under 128 characters.');
  if (await bcrypt.compare(next, user.passwordHash)) throw new HttpError(400, 'Your new password must be different from your current one.', 'same-password');
  user.passwordHash = await bcrypt.hash(next, 12);
  user.passwordChangedAt = new Date();
  user.sessions = [];
  await user.save();
  await User.updateOne({ _id: user._id }, { $unset: { passwordChange: 1 } });
  // A pending email change can't outlive a password change
  await dropEmailChange(user);
  await startSession(res, user);
  const { sendEmail, isEmailConfigured } = await import('../services/emailService.js');
  const { passwordChangedHtml } = await import('../services/emailTemplates.js');
  if (isEmailConfigured()) {
    sendEmail({ to: user.email, subject: 'Your Momento password was changed', html: passwordChangedHtml(user) })
      .catch((err) => console.error(`Password-changed email to ${user.email} failed: ${err.message}`));
  }
  res.json({ user: user.toPublic() });
}

export async function requestEmailChange(req, res) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Enter an email address like name@example.com.');
  if (email === req.user.email) throw new HttpError(400, 'That’s already your email.');
  // The current address has to approve the move, so it must be one the person really receives
  if (!req.user.emailVerified) throw new HttpError(403, 'Confirm your current email first.', 'unverified');
  await checkPassword(req.user, req.body?.password);
  if (await User.exists({ email })) throw new HttpError(409, 'Another account already uses that email.');
  await startEmailChange(req.user, email);
  res.json({ ok: true, pendingEmail: email, approveFrom: req.user.email });
}

// p***@example.com: enough to recognise your own address on the approval page
const maskEmail = (email) => { const [name, domain] = String(email).split('@'); return `${name.slice(0, 1)}***@${domain}`; };

// The approval page asks what the link is for before anyone presses a button
export async function emailApproveInfo(req, res) {
  const info = await peekEmailApproval(req.query.token);
  if (!info) throw new HttpError(400, 'This link has expired or was already used.', 'invalid');
  res.json({ newEmail: info.newEmail, email: maskEmail(info.email) });
}

// Approve (from the current inbox): the new address gets its confirm link
export async function approveEmail(req, res) {
  res.json({ result: await approveEmailChange(req.body?.token) });
}

// Not me: the change is dropped and every device is logged out
export async function cancelEmail(req, res) {
  res.json({ result: await cancelEmailChange(req.body?.token) });
}

// The link in the new address's email lands here. The move logs every device out, so it goes on to
// the home page's log in window, which says how it went.
export async function confirmEmailChange(req, res) {
  const result = await finishEmailChange(req.query.token);
  res.redirect(303, `${config.frontendUrl}/?login=1&email=${result}`);
}

// ---- Profile photo ----

export async function uploadAvatar(req, res) {
  if (!req.file) throw new HttpError(400, 'Choose a photo first.');
  const { saveAvatar } = await import('../services/avatarService.js');
  await saveAvatar(req.user, req.file.buffer);
  res.json({ user: req.user.toPublic() });
}

export async function deleteAvatar(req, res) {
  const { removeAvatar } = await import('../services/avatarService.js');
  await removeAvatar(req.user);
  res.json({ user: req.user.toPublic() });
}

export async function deleteMe(req, res) {
  await checkPassword(req.user, req.body?.password);
  await deleteAccount(req.user);
  await endSession(req, res);
  res.json({ ok: true });
}

// ---- Confirming the email address ----

// The link in the email lands here, then goes on to the home page, which says how it went
export async function verifyEmail(req, res) {
  const user = await confirmEmail(req.query.token);
  if (!user) return res.redirect(303, `${config.frontendUrl}/?verified=invalid`);
  try {
    if (String(req.user?._id) !== String(user._id)) await startSession(res, user);
  } catch (error) {
    if (error.code !== 'session_limit') throw error;
    return res.redirect(303, `${config.frontendUrl}/?login=1&verified=session_limit`);
  }
  // Signed up through an invite link: join that album now and open it
  const pending = await User.findById(user._id).select('+pendingJoin');
  if (pending?.pendingJoin) {
    await User.updateOne({ _id: user._id }, { $unset: { pendingJoin: 1 } });
    return res.redirect(303, config.frontendUrl + '/events.html?join=' + encodeURIComponent(pending.pendingJoin));
  }
  res.redirect(303, config.frontendUrl + '/albums.html?verified=1');
}

export async function resendVerification(req, res) {
  if (req.user.emailVerified) throw new HttpError(400, 'Your email is already confirmed.');
  const now = new Date();
  const retryAt = new Date(now.getTime() + 120000);
  const claimed = await User.findOneAndUpdate({
    _id: req.user._id,
    $or: [{ verificationResendAt: null }, { verificationResendAt: { $lte: now } }],
  }, { $set: { verificationResendAt: retryAt } }, { new: true });
  if (!claimed) {
    const current = await User.findById(req.user._id);
    const retryAfter = Math.max(1, Math.ceil((current.verificationResendAt - now) / 1000));
    return res.status(429).set('Retry-After', String(retryAfter)).json({
      error: 'Please wait before requesting another verification email.', retryAt: current.verificationResendAt,
    });
  }
  try {
    const { sent } = await sendVerificationEmail(req.user);
    res.json({ ok: true, sent, retryAt });
  } catch (error) {
    await User.updateOne({ _id: req.user._id, verificationResendAt: retryAt }, { $unset: { verificationResendAt: 1 } });
    throw error;
  }
}

// ---- Forgotten password ----

// Always the same answer, whether or not the address has an account, so this can't be used
// to find out who uses Momento. Accounts that only use Google get a link too: it
// lets them add a password.
export async function forgotPassword(req, res) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Enter an email address like name@example.com.');
  const user = await User.findOne({ email });
  if (user) {
    // After the response, so a slow mail server can't reveal (by timing) that the account exists
    setImmediate(() => sendResetEmail(user).catch((err) => console.error(`Reset email to ${email} failed: ${err.message}`)));
  }
  res.json({ ok: true });
}

export async function resetPassword(req, res) {
  const password = String(req.body?.password ?? '');
  if (password.length < 8) throw new HttpError(400, 'Use at least 8 characters for your password.');
  if (password.length > 128) throw new HttpError(400, 'Keep your password under 128 characters.');
  const user = await applyNewPassword(req.body?.token, password);
  if (!user) throw new HttpError(400, 'This reset link has expired or was already used. Ask for a new one.');
  // Taking the account back with a reset also stops any email change someone else started
  await dropEmailChange(user);
  // Logged in here; every older login, on any device, has just stopped working
  await signedIn(res, user);
}

// ---- Google ----

// One account per email: a verified Google email signs into (and links to) an
// existing account with that address instead of creating a second one.
async function socialSignIn(res, { provider, providerId, email, emailVerified, name, avatarUrl }) {
  const idField = { google: 'googleId' }[provider];
  let user = await User.findOne({ [idField]: providerId });

  if (!user) {
    if (!email) throw new HttpError(400, 'We need an email address from your account to sign you in.');
    if (!emailVerified) throw new HttpError(400, 'Verify your email with your account provider first, then try again.');
    user = await User.findOne({ email }).select('+passwordHash');
    if (user) {
      // Someone could have signed up with this address and a password before its real owner
      // arrived. The provider just proved ownership, so a password nobody confirmed is dropped.
      // Whoever was logged in to it with that password is logged out too.
      if (!user.emailVerified) {
        user.passwordHash = undefined;
        user.passwordChangedAt = new Date();
      }
      user[idField] = providerId;
      user.emailVerified = true;
    } else {
      user = new User({ email, emailVerified: true, [idField]: providerId });
    }
  }
  if (!user.name && name) user.name = name;
  if (!user.avatarUrl && avatarUrl) user.avatarUrl = avatarUrl;
  await signedIn(res, user, user.isNew ? 201 : 200);
}

// The browser opens Google's popup with a custom button and gets back a one-time code;
// the server swaps it (with the client secret) for an ID token and checks it
const googleClient = config.google.clientId && config.google.clientSecret
  ? new OAuth2Client(config.google.clientId, config.google.clientSecret, 'postmessage')
  : null;

export async function google(req, res) {
  if (!googleClient) throw new HttpError(503, 'Google sign-in isn’t set up on this server yet.');
  const code = String(req.body?.code || '');
  if (!code) throw new HttpError(400, 'Missing Google sign-in code.');
  let payload;
  try {
    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: config.google.clientId });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Google sign-in didn’t go through. Try again.');
  }
  await socialSignIn(res, {
    provider: 'google',
    providerId: payload.sub,
    email: payload.email?.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: payload.name,
    avatarUrl: payload.picture,
  });
}
