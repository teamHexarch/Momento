// Prints the stage-one calibration table built from staff decisions (the same one the server learns by itself
// every NSFW_RELEARN_HOURS and keeps in MongoDB; see src/services/stageOneLearning.js). Useful to inspect it, or
// to pin a table as a file (NSFW_CALIBRATION), which then takes precedence over the learned one.
//
//   node --env-file=.env scripts/calibrateFromReviews.js [calibration.json]   (no file: the table goes to stdout)
// On the AWS server:
//   cd /opt/momento/Server/deploy && sudo docker compose exec -T api node scripts/calibrateFromReviews.js
import { writeFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { calibrateFromReviews } from '../src/services/reviewCalibration.js';

export { reviewedRows, splitByGroup } from '../src/services/reviewCalibration.js';

if (process.argv[1]?.endsWith('calibrateFromReviews.js')) {
  const [output] = process.argv.slice(2);
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const { table } = await calibrateFromReviews((...args) => console.error(...args));
    const json = JSON.stringify(table, null, 2);
    if (output) await writeFile(output, json, { flag: 'wx' });
    else process.stdout.write(json + '\n');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
