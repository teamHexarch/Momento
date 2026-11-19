import { SecuritySetting } from '../models/SecuritySetting.js';
import { HttpError } from '../utils/httpError.js';

// The emergency switches (see models/SecuritySetting.js), read at most every 15 seconds per server
let cache = null, readAt = 0;
export async function switches() {
  if (cache && Date.now() - readAt < 15000) return cache;
  try {
    cache = (await SecuritySetting.findById('switches').lean()) || {};
    readAt = Date.now();
  } catch {
    cache ||= {};
  }
  return cache;
}
export const forgetSwitches = () => { cache = null; };

const MESSAGE = {
  signups: 'New sign-ups are paused for a little while. Please try again later.',
  uploads: 'Adding photos is paused for a little while. Please try again later.',
  joins: 'Joining albums is paused for a little while. Please try again later.',
};
export async function assertOpen(kind) {
  if ((await switches())[`${kind}Paused`]) throw new HttpError(503, MESSAGE[kind], 'paused');
}
// As route middleware: whenOpen('uploads')
export const whenOpen = (kind) => async (req, res, next) => {
  try { await assertOpen(kind); next(); } catch (err) { next(err); }
};
