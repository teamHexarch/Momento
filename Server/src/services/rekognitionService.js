import sharp from 'sharp';
import { config } from '../config/env.js';

// ---- AWS Rekognition (DetectModerationLabels): the nudity check, on AWS instead of this server's CPU ----
// Each photo's preview is sent to Rekognition, which answers with moderation labels and how sure it is of each (0-100).
// Those labels decide Momento's content level (the 7-level rubric):
//    0  General              everyday photos, non-sexual affection                   → published
//   25  Contextual exposure  swimwear, bare male chest, bare back, a kiss             → published
//   50  Mildly sexy          underwear or sexy clothing, no clear sexual intent       → published
//   75  Clearly suggestive   covered, but sexual intent; part of a breast showing     → published (since 2026-11-25)
//   85  Near-nude            covered only by hands/hair/objects; thong-bare buttocks  → private (uploader may ask for a review)
//   95  Nude, key areas hid  nude, but nipples and genitals hidden                    → private (uploader may ask for a review)
//  100  Nudity / explicit    visible nipples or genitals, any sexual activity, toys    → private for good (never published)
// A label counts only when Rekognition is at least that label's threshold sure. The thresholds start at the defaults
// below and move with staff decisions (learnFromReview): a little up when staff publish what a label held back, a
// little down when staff keep private what it let through, always within the label's guardrails. Level 100 labels
// never move: explicit content can't be learned into publishing.
// Access: the same IAM user as S3 and SES (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY) needs
// rekognition:DetectModerationLabels. No model runs on this server.

export const LEVELS = [0, 25, 50, 75, 85, 95, 100];
export const PUBLISH_MAX = 75;
export const SCORE_VERSION = 'rekognition-1';
export const MODEL_NAME = 'AWS Rekognition DetectModerationLabels';

// Label → level, starting threshold (%), and how far learning may move it. Rekognition's current labels (taxonomy 7)
// and the older names (taxonomy 6) it may still answer with. Matched without regard to case.
const L = (level, threshold, min = threshold - 20, max = Math.min(98, threshold + 25)) => ({ level, threshold, min, max });
export const LABELS = {
  // 100: explicit (fixed)
  'explicit': L(100, 60, 60, 60), 'explicit nudity': L(100, 60, 60, 60), 'explicit sexual activity': L(100, 60, 60, 60),
  'exposed female genitalia': L(100, 60, 60, 60), 'exposed male genitalia': L(100, 60, 60, 60),
  'exposed buttocks or anus': L(100, 60, 60, 60), 'exposed female nipple': L(100, 60, 60, 60), 'sex toys': L(100, 60, 60, 60),
  'nudity': L(100, 60, 60, 60), 'graphic male nudity': L(100, 60, 60, 60), 'graphic female nudity': L(100, 60, 60, 60),
  'sexual activity': L(100, 60, 60, 60), 'illustrated explicit nudity': L(100, 60, 60, 60), 'adult toys': L(100, 60, 60, 60),
  // 95: nude, key areas hidden
  'implied nudity': L(95, 70),
  // 85: near-nude
  'obstructed intimate parts': L(85, 70), 'obstructed female nipple': L(85, 70), 'obstructed male genitalia': L(85, 70),
  'partially exposed buttocks': L(85, 70), 'partial nudity': L(85, 70),
  // 75: clearly suggestive
  'partially exposed female breast': L(75, 70), 'sexual situations': L(75, 70),
  // 50: mildly sexy
  'revealing clothes': L(50, 60),
  // 25: contextual exposure
  'non-explicit nudity': L(25, 60), 'non-explicit nudity of intimate parts and kissing': L(25, 60),
  'swimwear or underwear': L(25, 60), 'female swimwear or underwear': L(25, 60), 'male swimwear or underwear': L(25, 60),
  'barechested male': L(25, 60), 'exposed male nipple': L(25, 60),
  'bare back': L(25, 60), 'kissing on the lips': L(25, 60), 'suggestive': L(25, 60),
};
const key = (name) => String(name || '').trim().toLowerCase();

// What happens to a photo at each level: 'publish' (0-75) | 'private' (85, 95) | 'locked' (100).
// ('staff', holding a photo for the review page, isn't used since 75 publishes.)
export function actionOf(level) {
  if (level <= PUBLISH_MAX) return 'publish';
  if (level === 75) return 'staff';
  if (level >= 100) return 'locked';
  return 'private';
}

// ---- Thresholds: the defaults, with what staff decisions have taught (kept in the ModerationCalibration collection) ----
let learned = {};
export const thresholdOf = (name) => {
  const rule = LABELS[key(name)];
  if (!rule) return null;
  const t = learned[key(name)];
  return Number.isFinite(t) ? Math.min(rule.max, Math.max(rule.min, t)) : rule.threshold;
};
export function thresholds() {
  return Object.fromEntries(Object.entries(LABELS).map(([k, r]) => [k, { level: r.level, threshold: thresholdOf(k), default: r.threshold, min: r.min, max: r.max }]));
}
export function setLearned(table) { learned = table && typeof table === 'object' && !Array.isArray(table) ? { ...table } : {}; }
export async function loadLearned() {
  const { ModerationCalibration } = await import('../models/ModerationCalibration.js');
  const doc = await ModerationCalibration.findById('rekognition').lean();
  setLearned(doc?.table);
  return learned;
}

// ---- Swimwear in context ----
// On an ordinary beach or pool photo Rekognition sees the swimwear, and often also "partially exposed" breast or
// buttocks: that's what a bikini or swimsuit shows. So when swimwear (or underwear) is clearly seen, those labels count
// as level 25 (published), not 75/85. Labels for real nudity (implied nudity, obstructed or exposed intimate parts,
// anything explicit) and sexual situations still count in full.
const SWIMWEAR = new Set(['swimwear or underwear', 'female swimwear or underwear', 'male swimwear or underwear']);
const SWIMWEAR_SURE = 70;
const EXPECTED_WITH_SWIMWEAR = new Set(['partially exposed female breast', 'partially exposed buttocks', 'partial nudity', 'bare back', 'exposed male nipple', 'barechested male']);

// The level from Rekognition's labels: the highest level among labels at or over their threshold.
// drivers: the labels that set it (what staff decisions teach about). swimwear: the swimwear rule applied.
export function levelOf(labels) {
  const swimwear = (labels || []).some((l) => SWIMWEAR.has(key(l.name)) && Number(l.confidence) >= SWIMWEAR_SURE);
  let level = 0, drivers = [];
  for (const l of labels || []) {
    const rule = LABELS[key(l.name)];
    if (!rule || !(Number(l.confidence) >= thresholdOf(l.name))) continue;
    const ruleLevel = swimwear && EXPECTED_WITH_SWIMWEAR.has(key(l.name)) ? Math.min(rule.level, 25) : rule.level;
    if (ruleLevel > level) { level = ruleLevel; drivers = [key(l.name)]; }
    else if (ruleLevel === level && level > 0) drivers.push(key(l.name));
  }
  return { level, drivers, ...(swimwear && { swimwear: true }) };
}

// ---- Learning from staff ("learn from us") ----
// staffLevel: the level staff chose on the review page; scores: what Rekognition said when the photo was checked.
//   staff publish (level 0-75) what was held back (85+) → each label that held it back needs to be a little surer (+STEP)
//   staff keep private (85+) what was let through (0-75) → each recognised label on it counts a little sooner (-STEP)
// Level 100 labels never move. Returns the changes made: { label: [before, after] }.
const STEP = 2;
export async function learnFromReview(scores, staffLevel) {
  if (scores?.engine !== 'rekognition' || !LEVELS.includes(staffLevel)) return {};
  const auto = levelOf(scores.labels);
  const staffPublishes = staffLevel <= PUBLISH_MAX, autoPublished = auto.level <= PUBLISH_MAX;
  if (staffPublishes === autoPublished) return {};
  const names = staffPublishes ? auto.drivers
    : (scores.labels || []).map((l) => key(l.name)).filter((n) => LABELS[n] && LABELS[n].level < 100 && LABELS[n].level > PUBLISH_MAX);
  const { ModerationCalibration } = await import('../models/ModerationCalibration.js');
  await loadLearned();
  const changes = {};
  for (const n of new Set(names)) {
    const rule = LABELS[n];
    if (!rule || rule.level >= 100) continue;
    const before = thresholdOf(n);
    const after = Math.min(rule.max, Math.max(rule.min, before + (staffPublishes ? STEP : -STEP)));
    if (after !== before) { learned[n] = after; changes[n] = [before, after]; }
  }
  if (Object.keys(changes).length) {
    await ModerationCalibration.updateOne({ _id: 'rekognition' }, { $set: { table: learned, builtAt: new Date() } }, { upsert: true });
  }
  return changes;
}

// ---- Asking Rekognition ----
let client = null, detector = null;
// For tests: a stand-in for Rekognition (buffer → [{ name, parent, confidence }])
export function useDetector(fn) { detector = fn; }
export const hasDetector = () => Boolean(detector);

// At most 10 photos with Rekognition at once (its default limit is far higher; this keeps memory steady)
const MAX_AT_ONCE = 10;
let running = 0; const waiting = [];
async function limited(fn) {
  if (running >= MAX_AT_ONCE) await new Promise((resolve) => waiting.push(resolve));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}

// Rekognition takes images up to 5 MB; a bigger preview is made smaller first
const MAX_BYTES = 5 * 1024 * 1024;
async function fit(buffer) {
  if (buffer.length <= MAX_BYTES) return buffer;
  return sharp(buffer, { limitInputPixels: 100_000_000 }).rotate().resize(2048, 2048, { fit: 'inside' }).jpeg({ quality: 85 }).toBuffer();
}

async function ask(buffer) {
  if (detector) return detector(buffer);
  if (!client) {
    const { RekognitionClient } = await import('@aws-sdk/client-rekognition');
    client = new RekognitionClient({ region: process.env.REKOGNITION_REGION || config.aws.region, maxAttempts: 1,
      requestHandler: { connectionTimeout: 5000, requestTimeout: 20000 } });
  }
  const { DetectModerationLabelsCommand } = await import('@aws-sdk/client-rekognition');
  const out = await client.send(new DetectModerationLabelsCommand({ Image: { Bytes: await fit(buffer) }, MinConfidence: 40 }));
  return (out.ModerationLabels || []).map((l) => ({ name: l.Name, parent: l.ParentName || '', confidence: l.Confidence }));
}

const RETRYABLE = new Set(['ThrottlingException', 'ProvisionedThroughputExceededException', 'InternalServerError', 'ServiceUnavailableException', 'TimeoutError']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Up to 4 tries, waiting 0.5 s, 1 s, 2 s between them (throttling and AWS-side errors only)
export async function detect(buffer, tries = 4) {
  return limited(async () => {
    for (let i = 0; ; i++) {
      try {
        const labels = await ask(buffer);
        return { engine: 'rekognition', version: SCORE_VERSION, labels, ...levelOf(labels) };
      } catch (error) {
        const retry = RETRYABLE.has(error.name) || error.$retryable || error.code === 'ECONNRESET';
        if (!retry || i >= tries - 1) throw error;
        await sleep(500 * 2 ** i);
      }
    }
  });
}
