import { Router } from 'express';
import multer from 'multer';
import { quarantineStorage } from '../services/uploadIntake.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { config } from '../config/env.js';
import { requireVerified } from '../middleware/authMiddleware.js';
import * as albums from '../controllers/albumController.js';
import { gameRoutes } from './gameRoutes.js';
import { whenOpen } from '../services/switches.js';
import { uploadBudget, dailyQuota } from '../middleware/uploadBudget.js';

// Making albums: 30 an hour per account. Whole-album zips (heavy to build): 20 an hour per account
const perAccount = (minutes, limit, error) => rateLimit({
  windowMs: minutes * 60000, limit, keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8', legacyHeaders: false, message: { error },
});
const createLimit = perAccount(60, 30, 'That’s a lot of new albums. Wait a while, then make more.');
// And at most ALBUMS_PER_DAY (10) a day, so one account can't spread a huge upload across hundreds of albums (audit M3)
const createDayLimit = perAccount(24 * 60, Number(process.env.ALBUMS_PER_DAY) || 10, 'That’s a lot of new albums for one day. Try again tomorrow.');
const downloadLimit = perAccount(60, 20, 'That’s a lot of downloads. Wait a while, then try again.');

// Uploads: 600 an hour per account (the page sends big selections as several small uploads side by side)
const uploadLimit = rateLimit({
  windowMs: 60 * 60000, limit: 600, keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'That’s a lot of uploading. Wait a while, then add the rest.' },
});

const upload = multer({
  // File names are UTF-8 (螢幕擷取畫面.png, café.jpg), not Latin-1
  defParamCharset: 'utf8',
  // Saved privately as it arrives; the nudity check (services/uploadChecks.js) decides what's published
  storage: quarantineStorage,
  // The ceiling is the RAW one; ordinary photos over MAX_UPLOAD_MB are skipped one by one in addPhotos,
  // so one oversized file never sinks the rest of the upload
  limits: { fileSize: Math.max(config.maxUploadBytes, config.maxRawUploadBytes), files: 30 },
  // MIME types and names come from the client and are not proof of image content.
  // sanitizePhoto fully decodes and re-encodes allowed image formats before any write.
});

// Codes have ~17 billion combinations, but guessing is capped anyway: 30 tries an hour per account
const joinLimit = rateLimit({
  windowMs: 60 * 60000,
  limit: 30,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many codes tried. Wait an hour, or check the code with the host.' },
});

export const albumRoutes = Router();

// Before logging in: what an album is, from its code (the code is the secret, so this is capped
// per visitor: 60 looks per 10 minutes, by account or by IP address)
const previewLimit = rateLimit({
  windowMs: 10 * 60000,
  limit: 60,
  keyGenerator: (req) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'That’s a lot of codes. Wait a few minutes, then try again.' },
});
albumRoutes.get('/preview/:code', previewLimit, albums.preview);
// The cover picture: shown on invites and the Events map too, so no login (its address has a token)
albumRoutes.get('/:id/cover/:token', albums.coverFile);

// Everything else needs an account with a confirmed email
albumRoutes.use(requireVerified);

albumRoutes.get('/', albums.list);
albumRoutes.post('/', createLimit, createDayLimit, albums.create);
albumRoutes.post('/join', joinLimit, whenOpen('joins'), albums.join);

albumRoutes.get('/:id', albums.show);
// An open album asks every 3 seconds (20 a minute); 60 a minute per account leaves room for a few tabs (audit M4)
albumRoutes.get('/:id/version', perAccount(1, 60, 'The album is checking for new photos too often. Wait a moment.'), albums.version);
albumRoutes.get('/:id/checks', albums.checkStatus);
albumRoutes.delete('/:id/checks/:check', albums.removeCheck);
albumRoutes.patch('/:id', albums.update);
albumRoutes.delete('/:id', albums.remove);
albumRoutes.delete('/:id/membership', albums.leave);

// Which files the album already has (by SHA-256), so the page skips them before uploading
albumRoutes.post('/:id/photos/known', albums.knownHashes);
albumRoutes.post('/:id/photos', uploadLimit, whenOpen('uploads'), dailyQuota, uploadBudget, albums.checkMember, upload.array('photos', 30), albums.addPhotos);
albumRoutes.get('/:id/download', downloadLimit, albums.download);
// The emailed link to a big album's zip (made in the background)
albumRoutes.get('/:id/zip/:token', albums.zipFile);
// Hide photos from your own view (everyone else still sees them)
albumRoutes.post('/:id/hidden', albums.setHidden);
// The bookmark: saved albums show under Liked
albumRoutes.post('/:id/save', albums.save);
// The host's cover picture: one image up to 15 MB, re-encoded small on the server
const coverUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });
albumRoutes.put('/:id/cover', uploadLimit, whenOpen('uploads'), uploadBudget, coverUpload.single('cover'), albums.putCover);
albumRoutes.delete('/:id/cover', albums.deleteCover);

albumRoutes.post('/:id/remind', albums.remind);
// Event mini-games (routes/gameRoutes.js)
albumRoutes.use('/:id/games', gameRoutes);
