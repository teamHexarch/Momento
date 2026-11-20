// One-off: makes the 320px "mini" grid picture for every photo that doesn't have one yet: photos in the
// bin and hidden photos too. Safe to run again (it only picks photos without a mini) and to stop half way.
//   node --env-file=.env scripts/makeMinis.js
// On the Lightsail server:
//   cd /opt/momento/Server/deploy && sudo docker compose exec api node scripts/makeMinis.js
import mongoose from 'mongoose';

const { config } = await import('../src/config/env.js');
const { Photo } = await import('../src/models/Photo.js');
const { initStorage, addMini } = await import('../src/services/storageService.js');

await mongoose.connect(config.mongoUri);
await initStorage();
const total = await Photo.countDocuments({ miniKey: { $in: [null, ''] } });
console.log(`${total} photo${total === 1 ? '' : 's'} need a mini.`);

let done = 0, failed = 0, lastId = null;
// In pages of 100, two at a time, so a big library doesn't fill the server's memory
for (;;) {
  const page = await Photo.find({ miniKey: { $in: [null, ''] }, ...(lastId && { _id: { $gt: lastId } }) }).sort({ _id: 1 }).limit(100);
  if (!page.length) break;
  lastId = page.at(-1)._id;
  let next = 0;
  await Promise.all([0, 1].map(async () => {
    while (next < page.length) {
      const p = page[next++];
      try { await addMini(p); done++; } catch (err) { failed++; console.log(`  ${p.id}: ${err.message}`); }
    }
  }));
  console.log(`  ${done + failed} / ${total} (${failed} failed)`);
}
console.log(`Done: ${done} minis made${failed ? `, ${failed} failed (their thumbnail is used instead)` : ''}.`);
await mongoose.disconnect();
