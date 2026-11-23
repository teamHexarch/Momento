// usage: node behave-diff.mjs <behave.mjs|behave-albums.mjs|behave-pages.mjs> <originalUrl> <newUrl>
// Runs a behaviour script against both sites and prints only what differs. Each script prints one JSON object.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [, , script, a, b] = process.argv;
const run = (url) => JSON.parse(execFileSync('node', [path.join(import.meta.dirname, script), url], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const A = run(a), B = run(b);
let n = 0;
(function walk(x, y, at) {
  if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], at ? `${at}.${k}` : k); return; }
  if (JSON.stringify(x) !== JSON.stringify(y)) { n++; console.log(`${at}\n   original: ${JSON.stringify(x)}\n   new:      ${JSON.stringify(y)}`); }
})(A, B, '');
console.log(n ? `\n${n} difference(s). Known, harmless ones: see qa/README.md` : '\nIdentical behaviour');