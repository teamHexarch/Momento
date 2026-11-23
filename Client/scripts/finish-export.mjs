// Runs after `next build` (see package.json). Tidies the static export in out/ for GitHub Pages.
//
// The pages live at /albums, /events ... and are written as albums.html, events.html ..., so GitHub Pages serves both
// /albums and the old /albums.html. Next also writes a folder per page with the data for in-app (next/link)
// navigation, which would get in the way (see below): it is removed.
//
// When the site moves to next/link navigation, revisit this: that needs the folders, and `trailingSlash: true` so
// GitHub Pages finds /albums/index.html (the old /albums.html addresses would then need redirect pages).
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(import.meta.dirname, '..', 'out');
const fail = (msg) => { console.error('finish-export: ' + msg); process.exit(1); };
if (!fs.existsSync(out)) fail('no out/ folder (did next build run with output: "export"?)');

let pages = 0;
// A page at /albums is written as albums.html next to a FOLDER albums/ holding the data for in-app (next/link)
// navigation. On GitHub Pages a request for /albums would find that folder (and redirect to /albums/, a 404) instead of
// serving albums.html. Every link is a plain <a> (a full page load), so nothing fetches it: it is removed.
// (Routes named like 'albums.html' would come out as albums.html.html: renamed to albums.html.)
for (const name of fs.readdirSync(out)) {
  if (name.endsWith('.html.html')) { fs.renameSync(path.join(out, name), path.join(out, name.slice(0, -5))); pages++; }
}
for (const name of fs.readdirSync(out)) {
  if (!name.endsWith('.html') || name === '404.html' || name === 'index.html') continue;
  const dir = path.join(out, name.slice(0, -5));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
  // Only ever delete Next's own navigation data
  const stray = fs.readdirSync(dir).filter((f) => !f.startsWith('__next.'));
  if (stray.length) fail(`${path.basename(dir)}/ holds more than navigation data: ${stray.join(', ')}`);
  fs.rmSync(dir, { recursive: true });
  pages++;
}

// GitHub Pages must not run Jekyll (it drops folders starting with "_", i.e. all of _next/), and keeps the domain
for (const f of ['.nojekyll', 'CNAME', '404.html', 'index.html', 'groups.html']) {
  if (!fs.existsSync(path.join(out, f))) fail(`out/${f} is missing`);
}
console.log(`finish-export: ${pages} pages tidied; out/ is ready for GitHub Pages`);
