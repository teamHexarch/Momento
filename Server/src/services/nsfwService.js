import sharp from 'sharp';
import { HttpError } from '../utils/httpError.js';
import { sha256 } from './contentSafety.js';

// Nudity check for everything people upload: album photos, cover pictures and profile pictures.
// A free, open-source model (NSFW.js, MobileNetV2) runs right here on the server, in plain JavaScript:
// about 120 MB of memory once it's loaded, and roughly half a second per photo. Photos are checked one
// at a time, so a big upload can't use up the server's memory.
//
// A photo is refused when its "Porn" + "Hentai" scores reach NSFW_THRESHOLD (0.6 unless set). Swimwear
// and other "Sexy" (suggestive, not explicit) photos are allowed: beach and pool events are normal.
// NSFW_CHECK=off turns the check off. If the model ever fails to load, uploads still work (logged).

const THRESHOLD = Number(process.env.NSFW_THRESHOLD) || 0.6;
const enabled = process.env.NSFW_CHECK !== 'off';
// Tests never load the real model (slow); they pass a stand-in with useClassifier
const testing = process.env.NODE_ENV === 'test';

let classifier = null, loading = null;
async function load() {
  if (classifier) return classifier;
  loading ||= (async () => {
    const tf = await import('@tensorflow/tfjs');
    const nsfw = await import('nsfwjs');
    await tf.setBackend('cpu');
    tf.enableProdMode();
    const model = await nsfw.load('MobileNetV2');
    classifier = async (buffer) => {
      const { data, info } = await sharp(buffer, { limitInputPixels: 100_000_000 }).rotate()
        .resize(224, 224, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const x = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
      try {
        const out = await model.classify(x, 5);
        return Object.fromEntries(out.map((c) => [c.className, c.probability]));
      } finally { x.dispose(); }
    };
    console.log('Nudity check: ready');
    return classifier;
  })().catch((err) => { loading = null; throw err; });
  return loading;
}

// For tests: use a stand-in instead of the real model
export function useClassifier(fn) { classifier = fn; }

// One photo at a time
let chain = Promise.resolve();
const oneAtATime = (fn) => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

// The scores for one photo, or null when the check is off or unavailable
export async function scan(buffer) {
  if (!enabled || (testing && !classifier)) return null;
  try {
    const classify = await load();
    return await oneAtATime(() => classify(buffer));
  } catch (err) {
    console.error(`Nudity check unavailable: ${err.message}`);
    return null;
  }
}

export function isExplicit(scores) {
  return !!scores && ((scores.Porn || 0) + (scores.Hentai || 0)) >= THRESHOLD;
}

// ---- Automatic decisions are recorded (models/ModerationDecision.js) ----
// Which model and threshold refused what, with its scores; the person can ask a human to review it,
// and a file staff allowed passes next time.
export const MODEL_NAME = 'nsfwjs 4.4.0 / MobileNetV2';
export const threshold = () => THRESHOLD;
export async function isAllowedFile(hash) {
  const { ModerationDecision } = await import('../models/ModerationDecision.js');
  return Boolean(await ModerationDecision.exists({ hash, status: 'allowed' }));
}
/**
 * Checks one upload: { blocked: false } or { blocked: true, decisionId } (the refusal is recorded).
 * ctx: { user, album?, kind: 'photo' | 'cover' | 'avatar' }
 */
export async function judge(buffer, ctx) {
  const scores = await scan(buffer);
  if (!isExplicit(scores)) return { blocked: false };
  const hash = sha256(buffer);
  if (await isAllowedFile(hash)) return { blocked: false };
  const { ModerationDecision } = await import('../models/ModerationDecision.js');
  const d = await ModerationDecision.create({ user: ctx.user, album: ctx.album, kind: ctx.kind, hash, model: MODEL_NAME, threshold: THRESHOLD, scores });
  return { blocked: true, decisionId: d.id };
}

// Throws a friendly 422 when the photo is explicit (with the decision's id, to ask for a review)
export async function assertAllowed(buffer, what = 'This photo', ctx = {}) {
  const r = ctx.user ? await judge(buffer, ctx) : { blocked: isExplicit(await scan(buffer)) };
  if (r.blocked) {
    throw new HttpError(422, `${what} can’t be added: it looks like it contains nudity, which isn’t allowed on Momento.`, 'nsfw', r.decisionId ? { decisionId: r.decisionId, review: `/api/auth/moderation/${r.decisionId}/review` } : {});
  }
}

// Loads the model in the background at start-up, so the first upload isn't slow
export function warmUp() {
  if (enabled && !testing && !classifier) load().catch((err) => console.error(`Nudity check unavailable: ${err.message}`));
}
