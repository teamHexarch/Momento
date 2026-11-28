import { HttpError } from '../utils/httpError.js';
import { sha256 } from './contentSafety.js';
import * as rekognition from './rekognitionService.js';

// The nudity check, for everything people upload: AWS Rekognition on AWS's computers (services/rekognitionService.js,
// the 7 levels). Nothing heavy runs on this server. Album photos go through the private check queue
// (services/uploadChecks.js, using scan); cover pictures and profile pictures are checked here (assertAllowed) and
// refused at level 85 or more (near-nude, nude or explicit).
// NSFW_CHECK=off turns the check off. Tests pass a stand-in for Rekognition (rekognition.useDetector).

const enabled = process.env.NSFW_CHECK !== 'off';
const testing = process.env.NODE_ENV === 'test';
// Covers and profile pictures: refused at this level or more
export const REFUSE_LEVEL = 85;
export const MODEL_NAME = rekognition.MODEL_NAME;
export const threshold = () => REFUSE_LEVEL;

// The check is switched off (NSFW_CHECK=off), or this is a test with no stand-in: every picture passes
export const checkIsOff = () => !enabled || (testing && !rekognition.hasDetector());

// The scores for one photo, or null when the check is off or unavailable
export async function scan(buffer) {
  if (checkIsOff()) return null;
  try {
    return await rekognition.detect(buffer);
  } catch (err) {
    console.error(`Nudity check unavailable: ${err.message}`);
    return null;
  }
}

export const isExplicit = (scores) => scores?.engine === 'rekognition' && scores.level >= REFUSE_LEVEL;

// ---- Automatic decisions are recorded (models/ModerationDecision.js) ----
// Which model and level refused what, with its scores; the person can ask a human to review it,
// and a file staff allowed passes next time.
export async function isAllowedFile(hash) {
  const { ModerationDecision } = await import('../models/ModerationDecision.js');
  return Boolean(await ModerationDecision.exists({ hash, status: 'allowed' }));
}
/**
 * Checks one upload: { blocked: false } or { blocked: true, decisionId } (the refusal is recorded).
 * ctx: { user, album?, kind: 'photo' | 'cover' | 'avatar', hash? }
 * ctx.hash: the uploaded file's fingerprint, when `buffer` is a smaller copy of it
 */
export async function judge(buffer, ctx) {
  const scores = await scan(buffer);
  if (!isExplicit(scores)) return { blocked: false };
  const hash = ctx.hash || sha256(buffer);
  if (await isAllowedFile(hash)) return { blocked: false };
  const { ModerationDecision } = await import('../models/ModerationDecision.js');
  const d = await ModerationDecision.create({ user: ctx.user, album: ctx.album, kind: ctx.kind, hash, model: MODEL_NAME, threshold: threshold(), scores,
    autoLevel: scores.level });
  return { blocked: true, decisionId: d.id };
}

// Throws a friendly 422 when the photo is explicit (with the decision's id, to ask for a review)
export async function assertAllowed(buffer, what = 'This photo', ctx = {}) {
  const r = ctx.user ? await judge(buffer, ctx) : { blocked: isExplicit(await scan(buffer)) };
  if (r.blocked) {
    throw new HttpError(422, `${what} can’t be added: it looks like it contains nudity, which isn’t allowed on Momento.`, 'nsfw', r.decisionId ? { decisionId: r.decisionId, review: `/api/auth/moderation/${r.decisionId}/review` } : {});
  }
}
