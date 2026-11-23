// usage: node make-reference.mjs "<folder with the original site>" [outDir=./reference-site]
// Copies the ORIGINAL static site and strips the stray " (1)" the download added to every file and folder name
// (index (1).html -> index.html, assets (1)\glass (1).css -> assets/glass.css), so the pages can run again.
// The originals are never touched. Then:  cd reference-site && node serve.mjs   (serves http://localhost:3000)
import fs from 'node:fs';
import path from 'node:path';

const [, , from, to = path.join(import.meta.dirname, 'reference-site')] = process.argv;
if (!from || !fs.existsSync(from)) { console.error('Give the folder that holds the original index.html'); process.exit(1); }
const SKIP = new Set(['momento-next', 'node_modules', 'temporary screenshots', '.git']);
const clean = (name) => name.replace(/ \(1\)/g, '');
let files = 0;
(function copy(dir, out) {
  fs.mkdirSync(out, { recursive: true });
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(clean(e.name)) || e.name === '.DS_Store' || e.name.endsWith('.cmd')) continue;
    const target = path.join(out, clean(e.name));
    if (e.isDirectory()) copy(path.join(dir, e.name), target);
    else { fs.copyFileSync(path.join(dir, e.name), target); files++; }
  }
})(from, to);
console.log(`Copied ${files} files to ${to}\nNow: cd "${to}" && node serve.mjs`);