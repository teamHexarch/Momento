// Each manifest line is JSON with a local image path and a human-labelled severity.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { sanitizePhoto } from '../src/services/imageService.js';
import { classify, lastStage } from '../src/services/uploadChecks.js';
import { LEVELS, truthOf, buildTable } from '../src/services/calibrationTable.js';
// NSFW_PIPELINE=stage-one calibrates only the first model (no model service needed)
const stages = [1, 2, 3].filter(stage => stage <= lastStage);

const [fitFile, holdoutFile, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/calibrateModeration.js fit.jsonl holdout.jsonl calibration.json');
const seen = new Set();
async function records(file) {
  const lines = (await readFile(file, 'utf8')).split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new Error('Empty labelled dataset: ' + file);
  const rows = [];
  for (const line of lines) {
    const { image, severity } = JSON.parse(line);
    if (!LEVELS.includes(severity)) throw new Error('Invalid human severity in ' + file);
    const bytes = await readFile(path.resolve(path.dirname(file), image));
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (seen.has(hash)) throw new Error('Duplicate image in calibration or holdout data');
    seen.add(hash);
    const clean = await sanitizePhoto(bytes, { name: image });
    const scores = [];
    for (const stage of stages) scores[stage] = await classify(stage, stage === 3 ? clean.preview : clean.thumbnail);
    rows.push({ truth: truthOf(severity), scores });
  }
  return rows;
}
const fit = await records(fitFile);
const holdout = await records(holdoutFile);
await writeFile(output, JSON.stringify(buildTable(fit, holdout, stages), null, 2), { flag: 'wx' });
