// Each manifest line is JSON with a local image path and a human-labelled severity.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sanitizePhoto } from '../src/services/imageService.js';
import { classify, routeScore } from '../src/services/uploadChecks.js';

const [fitFile, holdoutFile, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/calibrateModeration.js fit.jsonl holdout.jsonl calibration.json');
const levels = [0, 15, 25, 50, 75, 100];
const seen = new Set();
async function records(file) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new Error('Empty labelled dataset: ' + file);
  const rows = [];
  for (const line of lines) {
    const { image, severity } = JSON.parse(line);
    if (!levels.includes(severity)) throw new Error('Invalid human severity in ' + file);
    const bytes = await readFile(path.resolve(path.dirname(file), image));
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (seen.has(hash)) throw new Error('Duplicate image in calibration or holdout data');
    seen.add(hash);
    const clean = await sanitizePhoto(bytes, { name: image });
    const scores = [];
    for (const stage of [1, 2, 3]) scores[stage] = await classify(stage, stage === 3 ? clean.preview : clean.thumbnail);
    rows.push({ truth: severity <= 25 ? 'allow' : severity === 100 ? 'reject' : 'review', scores });
  }
  return rows;
}
// One-sided 95% Wilson lower bound; sparse or empty bins cannot imply high confidence.
function lowerBound(correct, n) {
  if (!n) return 0;
  const z = 1.645, p = correct / n;
  return (p + z*z/(2*n) - z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))) / (1 + z*z/n);
}
const table = {};
let fit = await records(fitFile);
let holdout = await records(holdoutFile);
for (const stage of [1, 2, 3]) {
  table[stage] = {};
  for (const action of stage === 3 ? ['allow', 'reject'] : ['allow']) {
    const threshold = stage === 1 ? .90 : .85;
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
    console.log(`Stage ${stage} ${action}: ${bins.length} supported bins`);
  }
  const escalated = row => routeScore(stage, row.scores[stage], table).action === 'escalate';
  fit = fit.filter(escalated);
  holdout = holdout.filter(escalated);
}
await writeFile(output, JSON.stringify(table, null, 2), { flag: 'wx' });
