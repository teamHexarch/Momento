// Serves the static export (out/) the way GitHub Pages does, so it can be tested before uploading:
//   npm run preview          -> http://localhost:3002     (PORT=xxxx to change)
// GitHub Pages rules copied here: /name serves name.html; a folder serves its index.html (and /folder redirects to
// /folder/); anything else gets 404.html with a 404 status.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'out');
const port = Number(process.env.PORT) || 3002;
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json',
};
if (!fs.existsSync(root)) { console.error('No out/ folder. Run `npm run build` first.'); process.exit(1); }

const isFile = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
const isDir = (f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } };
const send = (res, status, file) => {
  res.writeHead(status, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (p.endsWith('/') && isFile(path.join(file, 'index.html'))) return send(res, 200, path.join(file, 'index.html'));
  if (!p.endsWith('/') && isFile(file)) return send(res, 200, file);
  if (!p.endsWith('/') && isDir(file) && isFile(path.join(file, 'index.html'))) {
    res.writeHead(301, { Location: p + '/' + url.search }).end(); return;
  }
  if (!p.endsWith('/') && isFile(file + '.html')) return send(res, 200, file + '.html');
  const notFound = path.join(root, '404.html');
  if (isFile(notFound)) return send(res, 404, notFound);
  res.writeHead(404).end('Not found');
}).listen(port, () => console.log(`Static export (as GitHub Pages serves it): http://localhost:${port}`));
