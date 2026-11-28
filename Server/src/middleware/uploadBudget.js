import { HttpError } from '../utils/httpError.js';

// Uploads are read into memory (so they can be checked before anything is stored), and one request may
// carry 30 photos. So there's a ceiling on how much upload data the server holds at once
// (UPLOAD_MEMORY_MB, 400 unless set; the server has 1 GB), and each account may send 4 uploads at a time (the page sends 3 side by side).
// One account's uploads together may hold at most UPLOAD_USER_MB (150) of that, so a single account can't
// fill it and make everyone else wait. (One upload alone may be bigger, up to the ceiling: a big camera RAW.)
// Over any of these, the upload is turned away straight away, before any of it is read; the page can try again.
const BUDGET = (Number(process.env.UPLOAD_MEMORY_MB) || 400) * 1024 * 1024;
const USER_SHARE = (Number(process.env.UPLOAD_USER_MB) || 150) * 1024 * 1024;
const PER_USER = 4;
let inFlight = 0;
const perUser = new Map(), userBytes = new Map();

export function uploadBudget(req, res, next) {
  const size = Number(req.get('content-length'));
  // Browsers always say how big an upload is; one that won't is refused
  if (!Number.isFinite(size) || size <= 0) return next(new HttpError(411, 'The upload didn’t say how big it is. Try again.'));
  if (size > BUDGET) return next(new HttpError(413, 'That upload is too large. Send fewer photos at a time.'));
  const who = String(req.user?._id || req.ip);
  if ((perUser.get(who) || 0) >= PER_USER) return next(new HttpError(429, 'Wait for your other upload to finish, then try again.', 'upload-busy'));
  const mine = userBytes.get(who) || 0;
  if (mine > 0 && mine + size > USER_SHARE) return next(new HttpError(429, 'Wait for your other upload to finish, then try again.', 'upload-busy'));
  if (inFlight + size > BUDGET) return next(new HttpError(503, 'Momento is busy with a lot of uploads right now. Try again in a minute.', 'busy'));
  inFlight += size;
  perUser.set(who, (perUser.get(who) || 0) + 1);
  userBytes.set(who, mine + size);
  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    inFlight -= size;
    const n = (perUser.get(who) || 1) - 1;
    if (n) perUser.set(who, n); else perUser.delete(who);
    const left = (userBytes.get(who) || size) - size;
    if (left > 0) userBytes.set(who, left); else userBytes.delete(who);
  };
  res.on('finish', release);
  res.on('close', release);
  next();
}

// For tests
export const uploadsInFlight = () => ({ bytes: inFlight, users: perUser.size });

// ---- Daily storage quota (audit M3) ----
// What one account may add in 24 hours, in bytes: UPLOAD_DAY_GB (5 GB unless set). Stops one account filling the
// photo bucket (and the bill) through albums it made itself. The total is read from the database (photos by uploader,
// an indexed query) at most once a minute per account, plus what has been sent since.
const DAY_QUOTA = (Number(process.env.UPLOAD_DAY_GB) || 5) * 1024 ** 3;
const dayUse = new Map();   // account → { bytes, at }
// Counts `bytes` against the account's day (throws a 429 daily-quota when it would go over). Also used by direct
// uploads (services/directUploads.js), which ask before any byte is sent.
export async function chargeDailyQuota(req, bytes) {
  const who = String(req.user?._id || '');
  if (!who) return;
  let use = dayUse.get(who);
  if (!use || use.at < Date.now() - 60000) {
    const { Photo } = await import('../models/Photo.js');
    const [row] = await Photo.aggregate([
      { $match: { uploader: req.user._id, createdAt: { $gt: new Date(Date.now() - 86400000) } } },
      { $group: { _id: null, bytes: { $sum: '$size' } } },
    ]);
    use = { bytes: row?.bytes || 0, at: Date.now() };
    dayUse.set(who, use);
    if (dayUse.size > 20000) dayUse.clear();
  }
  if (use.bytes + bytes > DAY_QUOTA) {
    throw new HttpError(429, `You’ve added a lot today (the limit is ${DAY_QUOTA / 1024 ** 3} GB a day). Try the rest tomorrow.`, 'daily-quota');
  }
  use.bytes += bytes;
}
export async function dailyQuota(req, res, next) {
  try {
    await chargeDailyQuota(req, Number(req.get('content-length')) || 0);
    next();
  } catch (err) { next(err); }
}
