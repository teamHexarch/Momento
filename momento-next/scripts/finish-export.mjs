// Runs after `next build` (see package.json). Tidies the static export in out/ for GitHub Pages.
//
// The pages live at /albums.html, /events.html ... (the page scripts depend on those addresses). For a route named
// `albums.html` Next writes the page as `albums.html.html`, next to a FOLDER called `albums.html` that holds the data
// for in-app (next/link) navigation. On GitHub Pages a request for /albums.html would hit that folder, not the page.
// Every link on the site is a plain <a> (a full page load), so nothing ever fetches that folder: it is removed and the
// page takes its proper name.
//
// When the site moves to next/link navigation and clean URLs (/albums), revisit this: that needs the folders, and
// `trailingSlash: true` so GitHub Pages finds /albums/index.html.
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve(import.meta.dirname, '..', 'out');
const fail = (msg) => { console.error('finish-export: ' + msg); process.exit(1); };
if (!fs.existsSync(out)) fail('no out/ folder (did next build run with output: "export"?)');

let pages = 0;
for (const name of fs.readdirSync(out)) {
  if (!name.endsWith('.html.html')) continue;
  const page = name.slice(0, -'.html'.length); // albums.html
  const dir = path.join(out, page);
  if (fs.existsSync(dir)) {
    if (!fs.statSync(dir).isDirectory()) fail(`${page} exists and is not a folder`);
    // Only ever delete Next's own navigation data
    const stray = fs.readdirSync(dir).filter((f) => !f.startsWith('__next.'));
    if (stray.length) fail(`${page}/ holds more than navigation data: ${stray.join(', ')}`);
    fs.rmSync(dir, { recursive: true });
  }
  fs.renameSync(path.join(out, name), path.join(out, page));
  pages++;
}

// GitHub Pages must not run Jekyll (it drops folders starting with "_", i.e. all of _next/), and keeps the domain
for (const f of ['.nojekyll', 'CNAME', '404.html', 'index.html', 'groups.html']) {
  if (!fs.existsSync(path.join(out, f))) fail(`out/${f} is missing`);
}
console.log(`finish-export: ${pages} pages renamed; out/ is ready for GitHub Pages`);
