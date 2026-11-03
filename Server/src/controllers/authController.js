import crypto from 'node:crypto';
import { verifySignupCaptcha } from '../services/captchaService.js';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config/env.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/httpError.js';
import { startSession, endSession, setTempCookie, clearTempCookie } from '../utils/session.js';
import { sendVerificationEmail, confirmEmail } from '../services/verificationService.js';
import { sendResetEmail, resetPassword as applyNewPassword } from '../services/passwordResetService.js';
import { startEmailChange, finishEmailChange, deleteAccount } from '../services/accountService.js';

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
  return [user.googleId && 'Google', user.appleId && 'Apple'].filter(Boolean).join(' or ');
}

async function signedIn(res, user, status = 200) {
  user.lastLoginAt = new Date();
  await user.save();
  await startSession(res, user);
  res.status(status).json({ user: user.toPublic() });
}

// ---- Email and password ----

export async function signup(req, res) {
  await verifySignupCaptcha(req.body?.captchaToken, config.turnstile);
  const { name, email, password } = readCredentials(req.body, { needName: true });
  const existing = await User.findOne({ email }).select('+passwordHash');
  if (existing) {
    if (!existing.passwordHash && providerNames(existing)) {
      throw new HttpError(409, `This email already has an account. Continue with ${providerNames(existing)} instead.`);
    }
    throw new HttpError(409, 'An account with this email already exists. Log in instead.');
  }
  const user = new User({ name, email, passwordHash: await bcrypt.hash(password, 12) });
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
// can't take the account away. Google/Apple-only accounts have no password to give.
async function checkPassword(user, password) {
  if (!user.passwordHash) return;
  if (!password || !(await bcrypt.compare(String(password), user.passwordHash))) {
    throw new HttpError(401, 'That password isn’t right.');
  }
}

export async function requestEmailChange(req, res) {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Enter an email address like name@example.com.');
  if (email === req.user.email) throw new HttpError(400, 'That’s already your email.');
  await checkPassword(req.user, req.body?.password);
  if (await User.exists({ email })) throw new HttpError(409, 'Another account already uses that email.');
  await startEmailChange(req.user, email);
  res.json({ ok: true, pendingEmail: email });
}

// The link in the new address's email lands here, then goes on to Settings, which says how it went
export async function confirmEmailChange(req, res) {
  const result = await finishEmailChange(req.query.token);
  res.redirect(303, `${config.frontendUrl}/settings.html?email=${result}`);
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
  res.redirect(303, `${config.frontendUrl}/?verified=${user ? '1' : 'invalid'}`);
}

export async function resendVerification(req, res) {
  if (req.user.emailVerified) throw new HttpError(400, 'Your email is already confirmed.');
  const { sent } = await sendVerificationEmail(req.user);
  res.json({ ok: true, sent });
}

// ---- Forgotten password ----

// Always the same answer, whether or not the address has an account, so this can't be used
// to find out who uses Momento. Accounts that only use Google or Apple get a link too: it
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
  // Logged in here; every older login, on any device, has just stopped working
  await signedIn(res, user);
}

// ---- Google and Apple ----

// One account per email: a verified Google or Apple email signs into (and links to) an
// existing account with that address instead of creating a second one.
async function socialSignIn(res, { provider, providerId, email, emailVerified, name, avatarUrl }) {
  const idField = provider === 'google' ? 'googleId' : 'appleId';
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

// Apple: the server hands out a nonce, Apple's popup signs it into an ID token, and the
// server checks the token against Apple's public keys and that nonce
const APPLE_NONCE = 'momento_apple_nonce';
const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export function appleStart(req, res) {
  if (!config.apple.clientId) throw new HttpError(503, 'Apple sign-in isn’t set up on this server yet.');
  const nonce = crypto.randomBytes(16).toString('base64url');
  setTempCookie(res, APPLE_NONCE, nonce);
  res.json({ clientId: config.apple.clientId, redirectURI: config.frontendUrl, nonce });
}

export async function apple(req, res) {
  if (!config.apple.clientId) throw new HttpError(503, 'Apple sign-in isn’t set up on this server yet.');
  const idToken = String(req.body?.idToken || '');
  const expected = req.signedCookies?.[APPLE_NONCE];
  clearTempCookie(res, APPLE_NONCE);
  if (!idToken || !expected) throw new HttpError(400, 'Apple sign-in expired. Try again.');
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, appleKeys, { issuer: 'https://appleid.apple.com', audience: config.apple.clientId }));
  } catch {
    throw new HttpError(401, 'Apple sign-in didn’t go through. Try again.');
  }
  if (payload.nonce !== expected) throw new HttpError(401, 'Apple sign-in didn’t go through. Try again.');
  // Apple sends the person's name only the first time, from the browser, not in the token
  const n = req.body?.name || {};
  const name = [n.firstName, n.lastName].filter(Boolean).join(' ').trim().slice(0, 80);
  await socialSignIn(res, {
    provider: 'apple',
    providerId: payload.sub,
    email: typeof payload.email === 'string' ? payload.email.toLowerCase() : '',
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name,
  });
}
