// Builds the calibration table (NSFW_CALIBRATION) from human-labelled rows: { truth, scores[stage] }.
// Used by scripts/calibrateModeration.js (labelled photo files) and scripts/calibrateFromReviews.js (staff decisions).
import { routeScore } from './uploadChecks.js';

// Momento's content levels (0/15/25/50/75/100). With one model (stage one) 0-50 may publish, 75 needs staff and
// 100 can be rejected; the three-stage cascade keeps its stricter 0-25.
export const LEVELS = [0, 15, 25, 50, 75, 100];
export const STAGE_ONE_PUBLISH_MAX = 50;
export const CASCADE_PUBLISH_MAX = 25;
export const truthOf = (severity, publishMax = CASCADE_PUBLISH_MAX) => severity <= publishMax ? 'allow' : severity === 100 ? 'reject' : 'review';

// One-sided 95% Wilson lower bound; sparse or empty bins cannot imply high confidence.
export function lowerBound(correct, n) {
  if (!n) return 0;
  const z = 1.645, p = correct / n;
  return (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
}

// A score bin is enabled only when both the fit and the holdout rows support its action at the stage threshold.
// Each later stage is evaluated only on the rows the earlier stages would have escalated.
export function buildTable(fit, holdout, stages, log = console.log) {
  const table = {};
  for (const stage of stages) {
    table[stage] = {};
    for (const action of stage === 3 ? ['allow', 'reject'] : ['allow']) {
      // A range is trusted at 85% (one-sided 95% lower bound, in both halves)
      const threshold = .85;
      const bins = [];
      for (let i = 0; i < 10; i++) {
        const min = i / 10, max = (i + 1) / 10;
        const inBin = row => {
          const scores = row.scores[stage];
          if (stage === 3 && !(action === 'allow' ? [0, 15, 25] : [100]).includes(scores.severity)) return false;
          return scores[action] >= min && (scores[action] < max || (i === 9 && scores[action] === 1));
        };
        const precision = rows => lowerBound(rows.filter(row => row.truth === action).length, rows.length);
        const training = fit.filter(inBin), validation = holdout.filter(inBin);
        const confidence = Math.min(precision(training), precision(validation));
        if (confidence >= threshold) bins.push({ min, max, confidence, fitCount: training.length, holdoutCount: validation.length });
      }
      table[stage][action] = bins;
      log(`Stage ${stage} ${action}: ${bins.length} supported bins`);
    }
    const escalated = row => routeScore(stage, row.scores[stage], table).action === 'escalate';
    fit = fit.filter(escalated);
    holdout = holdout.filter(escalated);
  }
  return table;
}
