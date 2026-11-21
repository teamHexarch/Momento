// Builds the calibration table (NSFW_CALIBRATION, or the one the server learns) from human-labelled rows:
// { truth, scores: { 1: { allow } } }. Used by services/reviewCalibration.js (staff decisions) and
// scripts/labelPhotos.js exports.
import { CONFIDENCE, SCORE_VERSION } from './uploadChecks.js';

// Momento's content levels (0/15/25/50/75/100). With one model, 0-50 may publish; 75 and 100 are declined
// (75 is staff's call in context when the uploader asks for a review).
export const LEVELS = [0, 15, 25, 50, 75, 100];
export const STAGE_ONE_PUBLISH_MAX = 50;
export const truthOf = (severity, publishMax = STAGE_ONE_PUBLISH_MAX) => severity <= publishMax ? 'allow' : 'decline';

// One-sided 95% Wilson lower bound; sparse or empty bins cannot imply high confidence.
export function lowerBound(correct, n) {
  if (!n) return 0;
  const z = 1.645, p = correct / n;
  return (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
}

// A score range (tenths of 0-1) may publish on its own only when both the fit and the holdout rows show it's
// right at least CONFIDENCE (85%) of the time (one-sided 95% lower bound, in both halves). A row may carry a weight
// (a photo kept private for a serious reason counts more, see utils/reviewReasons.js) and a veto (a possible minor:
// that range never publishes on its own).
export function buildTable(fit, holdout, stages = [1], log = console.log) {
  const table = { scoreVersion: SCORE_VERSION };
  if (!stages.includes(1)) return table;
  const bins = [];
  const weight = row => (Number.isFinite(row.weight) && row.weight > 0 ? row.weight : 1);
  const sum = rows => rows.reduce((total, row) => total + weight(row), 0);
  for (let i = 0; i < 10; i++) {
    const min = i / 10, max = (i + 1) / 10;
    const inBin = row => { const a = row.scores[1]?.allow; return a >= min && (a < max || (i === 9 && a === 1)); };
    const precision = rows => lowerBound(sum(rows.filter(row => row.truth === 'allow')), sum(rows));
    const training = fit.filter(inBin), validation = holdout.filter(inBin);
    if ([...training, ...validation].some(row => row.veto)) { log(`Score range ${min}-${max}: never on its own (staff flagged a possible minor)`); continue; }
    const confidence = Math.min(precision(training), precision(validation));
    if (confidence >= CONFIDENCE) bins.push({ min, max, confidence, fitCount: training.length, holdoutCount: validation.length });
  }
  table[1] = { allow: bins };
  log(`Publish on its own: ${bins.length} supported score range(s)`);
  return table;
}
