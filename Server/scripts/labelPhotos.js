// Local tool for labelling photos for scripts/calibrateModeration.js. It only runs on this computer:
//   node scripts/labelPhotos.js <photo folder> [--port 4100]
// Put sample photos in the folder, one subfolder per event (photos of the same event stay in the same split).
// Labels are saved in <folder>/labels.json after every click, so you can stop and continue later.
// "Export" writes <folder>/fit.jsonl and <folder>/holdout.jsonl for the calibration script.
// Model scores are deliberately not shown, so they cannot influence the human labels.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sanitizePhoto, RAW_TYPES } from '../src/services/imageService.js';

export const LEVELS = [0, 15, 25, 50, 75, 100];
const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif', 'tif', 'tiff', ...Object.keys(RAW_TYPES)]);
const OUTPUTS = new Set(['labels.json', 'fit.jsonl', 'holdout.jsonl']);
const sha256 = data => createHash('sha256').update(data).digest('hex');

// Every image under root (sorted), with its event (first subfolder, or the file itself when it sits at the top)
// and content hash. Byte-identical copies are listed once; the calibration script rejects duplicates.
export async function scanPhotos(root) {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && IMAGE_EXT.has(path.extname(entry.name).slice(1).toLowerCase())) {
        files.push(path.relative(root, full).split(path.sep).join('/'));
      }
    }
  }
  await walk(root);
  files.sort();
  const photos = [], duplicates = [], seen = new Map();
  for (const rel of files) {
    const hash = sha256(await readFile(path.join(root, rel)));
    if (seen.has(hash)) { duplicates.push({ rel, sameAs: seen.get(hash) }); continue; }
    seen.set(hash, rel);
    photos.push({ id: photos.length, rel, event: rel.includes('/') ? rel.split('/')[0] : rel, hash });
  }
  return { photos, duplicates };
}

// Whole events go to one split. Events are visited in a fixed (hashed) order and each goes to the split with fewer
// publishable (0-25) photos so far, so both splits get a similar number of the photos calibration needs most.
export function splitByEvent(photos, labels) {
  const events = new Map();
  for (const photo of photos) {
    if (!LEVELS.includes(labels[photo.rel])) continue;
    if (!events.has(photo.event)) events.set(photo.event, []);
    events.get(photo.event).push({ image: photo.rel, severity: labels[photo.rel] });
  }
  const split = { fit: [], holdout: [] };
  const safe = rows => rows.filter(row => row.severity <= 25).length;
  for (const name of [...events.keys()].sort((a, b) => sha256(a).localeCompare(sha256(b)))) {
    const rows = events.get(name);
    const key = safe(split.fit) !== safe(split.holdout) ? (safe(split.fit) < safe(split.holdout) ? 'fit' : 'holdout')
      : split.fit.length <= split.holdout.length ? 'fit' : 'holdout';
    split[key].push(...rows);
  }
  return split;
}

export async function loadLabels(root) {
  try { return JSON.parse(await readFile(path.join(root, 'labels.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

async function writeAtomic(file, text) {
  await writeFile(file + '.tmp', text);
  await rename(file + '.tmp', file);
}

export async function exportSplits(root, photos, labels) {
  const split = splitByEvent(photos, labels);
  if (!split.fit.length || !split.holdout.length) {
    throw new Error('Label photos from at least two events (subfolders) first: each split needs its own events.');
  }
  for (const name of ['fit', 'holdout']) {
    await writeAtomic(path.join(root, name + '.jsonl'), split[name].map(row => JSON.stringify(row)).join('\n') + '\n');
  }
  const count = rows => ({ total: rows.length, safe: rows.filter(row => row.severity <= 25).length });
  return { fit: count(split.fit), holdout: count(split.holdout) };
}

export async function startLabelServer(root, port = 4100) {
  root = path.resolve(root);
  const { photos, duplicates } = await scanPhotos(root);
  const labels = await loadLabels(root);
  const byId = id => photos[Number.isInteger(id) ? id : -1];
  const allowedHosts = new Set();
  const server = createServer(async (req, res) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
    };
    try {
      // Only this computer's own page may use the tool (no DNS rebinding, no requests from other websites)
      if (!allowedHosts.has(req.headers.host)) return send(403, { error: 'Forbidden host' });
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (req.method === 'POST') {
        if (req.headers.origin !== 'http://' + req.headers.host || !req.headers['content-type']?.startsWith('application/json')) {
          return send(403, { error: 'Forbidden' });
        }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (url.pathname === '/api/label') {
          const photo = byId(body.id);
          if (!photo || !(body.severity === null || LEVELS.includes(body.severity))) return send(400, { error: 'Invalid label' });
          if (body.severity === null) delete labels[photo.rel];
          else labels[photo.rel] = body.severity;
          await writeAtomic(path.join(root, 'labels.json'), JSON.stringify(labels, null, 2));
          return send(200, { ok: true });
        }
        if (url.pathname === '/api/export') {
          try { return send(200, { ...await exportSplits(root, photos, labels), folder: root }); }
          catch (error) { return send(400, { error: error.message }); }
        }
        return send(404, { error: 'Not found' });
      }
      if (url.pathname === '/') return send(200, PAGE, 'text/html; charset=utf-8');
      if (url.pathname === '/api/state') {
        return send(200, { folder: root, duplicates, photos: photos.map(({ id, rel, event }) => ({ id, rel, event, severity: labels[rel] ?? null })) });
      }
      const match = url.pathname.match(/^\/photo\/(\d+)$/);
      if (match) {
        const photo = byId(Number(match[1]));
        if (!photo) return send(404, { error: 'Not found' });
        // Same decoding as uploads (HEIC, camera RAW, rotation), shown as a preview
        const clean = await sanitizePhoto(await readFile(path.join(root, photo.rel)), { name: photo.rel });
        const type = clean.preview[0] === 0xff ? 'image/jpeg' : 'image/webp';
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        return res.end(clean.preview);
      }
      return send(404, { error: 'Not found' });
    } catch (error) {
      if (!res.headersSent) send(500, { error: error.message });
      else res.destroy();
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const actual = server.address().port;
  allowedHosts.add('127.0.0.1:' + actual).add('localhost:' + actual);
  return { server, port: actual, photos, duplicates };
}

const PAGE = `<!doctype html>
<html lang="zh-Hant-HK">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Momento 相片標記</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f5f2; --fg: #1d1d1b; --muted: #6b6a66; --card: #fff; --line: #dedcd6;
    --safe: #2f7d4f; --review: #b7791f; --reject: #b83b3b; --accent: #2b59c3; }
  @media (prefers-color-scheme: dark) { :root { --bg: #171716; --fg: #ecebe7; --muted: #9a9892; --card: #222220; --line: #3a3936; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, "Microsoft JhengHei", sans-serif; }
  header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); }
  header h1 { font-size: 17px; margin: 0; }
  .muted { color: var(--muted); }
  .bar { flex: 1 1 200px; height: 8px; background: var(--line); border-radius: 4px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); width: 0; }
  main { display: grid; grid-template-columns: 1fr 320px; gap: 16px; padding: 16px; max-width: 1400px; margin: 0 auto; }
  @media (max-width: 900px) { main { grid-template-columns: 1fr; } }
  .stage { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0; }
  .stage img { display: block; width: 100%; height: min(68vh, 900px); object-fit: contain; background: #0001; border-radius: 6px; }
  .meta { display: flex; justify-content: space-between; gap: 8px; margin: 8px 0; flex-wrap: wrap; word-break: break-all; }
  .levels { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
  @media (max-width: 600px) { .levels { grid-template-columns: repeat(3, 1fr); } }
  .levels button { padding: 10px 4px; border-radius: 8px; border: 2px solid var(--line); background: var(--card); color: var(--fg);
    font: inherit; cursor: pointer; }
  .levels button b { display: block; font-size: 20px; }
  .levels button small { display: block; color: var(--muted); font-size: 12px; }
  .levels button[data-group=safe] b { color: var(--safe); }
  .levels button[data-group=review] b { color: var(--review); }
  .levels button[data-group=reject] b { color: var(--reject); }
  .levels button.on { border-color: var(--accent); outline: 2px solid var(--accent); }
  .nav { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
  .nav button, aside button { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--card); color: var(--fg); font: inherit; cursor: pointer; }
  aside { display: flex; flex-direction: column; gap: 12px; }
  aside section { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
  aside h2 { font-size: 15px; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; } td:last-child { text-align: right; }
  .primary { background: var(--accent) !important; color: #fff !important; border-color: var(--accent) !important; }
  pre { white-space: pre-wrap; word-break: break-all; background: #0001; padding: 8px; border-radius: 6px; font-size: 12px; }
  .warn { color: var(--reject); }
  kbd { border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>Momento 相片標記</h1>
  <span id="progress" class="muted"></span>
  <div class="bar"><i id="bar"></i></div>
  <label><input type="checkbox" id="onlyOpen" checked> 只睇未標記</label>
</header>
<main>
  <div class="stage">
    <img id="photo" alt="">
    <div class="meta"><span id="name"></span><span id="event" class="muted"></span></div>
    <div class="levels" id="levels"></div>
    <div class="nav">
      <button id="prev">← 上一張</button>
      <button id="next">下一張 →</button>
      <button id="clear">清除呢張嘅標記</button>
    </div>
    <p class="muted">快捷鍵：<kbd>1</kbd>–<kbd>6</kbd> 揀分數，<kbd>←</kbd> <kbd>→</kbd> 轉相，<kbd>Backspace</kbd> 清除。揀完會自動跳去下一張。</p>
  </div>
  <aside>
    <section>
      <h2>點樣評分</h2>
      <div class="muted">只睇相片本身，唔好估模型會點判。<br>0–25：可以即刻公開　50–75：要管理員睇　100：一定唔可以公開</div>
    </section>
    <section>
      <h2>已標記</h2>
      <table id="counts"></table>
    </section>
    <section>
      <h2>匯出</h2>
      <p class="muted">每份資料最少要 25 張安全相（0–25）先有機會開到一個分數段；建議每份 100 張以上，越貼近真實相簿越好。同一活動嘅相會放埋同一份。</p>
      <button id="export" class="primary">匯出 fit.jsonl 同 holdout.jsonl</button>
      <div id="result"></div>
    </section>
    <section id="dupBox" hidden>
      <h2 class="warn">重複嘅相（已略過）</h2>
      <div id="dups" class="muted"></div>
    </section>
  </aside>
</main>
<script>
const LEVELS = [
  [0, '完全正常', 'safe'], [15, '輕微：泳衣、運動服', 'safe'], [25, '有啲暴露但可公開', 'safe'],
  [50, '性感／半裸，要人睇', 'review'], [75, '好可能唔適合', 'review'], [100, '明顯色情，要拒絕', 'reject'],
];
let photos = [], index = 0, folder = '';
const $ = id => document.getElementById(id);
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || r.status); return data; });
for (const [value, text, group] of LEVELS) {
  const b = document.createElement('button');
  b.dataset.value = value; b.dataset.group = group;
  b.innerHTML = '<b>' + value + '</b><small></small>';
  b.querySelector('small').textContent = text;
  b.onclick = () => label(value);
  $('levels').append(b);
}
function visible() { return $('onlyOpen').checked ? photos.filter(p => p.severity === null || p === photos[index]) : photos; }
function move(step) {
  const list = visible(), at = list.indexOf(photos[index]);
  const next = list[at + step];
  if (next) { index = next.id; render(); }
}
function nextOpen() {
  const open = photos.slice(index + 1).concat(photos.slice(0, index)).find(p => p.severity === null);
  if (open) index = open.id;
  render();
}
async function label(severity) {
  const photo = photos[index];
  if (!photo) return;
  await post('/api/label', { id: photo.id, severity });
  photo.severity = severity;
  if (severity === null) render(); else nextOpen();
}
function render() {
  const photo = photos[index];
  const done = photos.filter(p => p.severity !== null).length;
  $('progress').textContent = '已標記 ' + done + ' / ' + photos.length + ' 張';
  $('bar').style.width = (photos.length ? done / photos.length * 100 : 0) + '%';
  if (photo) {
    $('photo').src = '/photo/' + photo.id;
    $('photo').alt = photo.rel;
    $('name').textContent = photo.rel;
    $('event').textContent = '活動：' + photo.event;
  } else {
    $('photo').removeAttribute('src');
    $('name').textContent = '資料夾入面搵唔到相：' + folder;
  }
  for (const b of $('levels').children) b.classList.toggle('on', !!photo && Number(b.dataset.value) === photo.severity);
  $('counts').innerHTML = '';
  for (const [value, text] of LEVELS) {
    const row = $('counts').insertRow();
    row.insertCell().textContent = value + '　' + text;
    row.insertCell().textContent = photos.filter(p => p.severity === value).length;
  }
}
$('prev').onclick = () => move(-1);
$('next').onclick = () => move(1);
$('clear').onclick = () => label(null);
$('onlyOpen').onchange = render;
$('export').onclick = async () => {
  $('result').textContent = '匯出緊…';
  try {
    const r = await post('/api/export', {});
    const sep = r.folder.includes('\\\\') ? '\\\\' : '/';
    $('result').innerHTML = '<p>fit：' + r.fit.total + ' 張（安全 ' + r.fit.safe + '）<br>holdout：' + r.holdout.total + ' 張（安全 ' + r.holdout.safe
      + '）</p><p class="muted">喺 Server 資料夾跑：</p><pre></pre>';
    $('result').querySelector('pre').textContent = 'node --env-file=.env scripts/calibrateModeration.js "' + r.folder + sep + 'fit.jsonl" "'
      + r.folder + sep + 'holdout.jsonl" calibration.json';
  } catch (error) { $('result').innerHTML = '<p class="warn"></p>'; $('result').firstChild.textContent = error.message; }
};
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 6) { e.preventDefault(); label(LEVELS[n - 1][0]); }
  else if (e.key === 'ArrowRight') move(1);
  else if (e.key === 'ArrowLeft') move(-1);
  else if (e.key === 'Backspace') { e.preventDefault(); label(null); }
});
fetch('/api/state').then(r => r.json()).then(state => {
  photos = state.photos; folder = state.folder;
  const open = photos.find(p => p.severity === null);
  index = open ? open.id : 0;
  if (state.duplicates.length) {
    $('dupBox').hidden = false;
    $('dups').textContent = state.duplicates.map(d => d.rel + ' = ' + d.sameAs).join('\\n');
    $('dups').style.whiteSpace = 'pre-wrap';
  }
  render();
});
</script>
</body>
</html>`;

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const portAt = args.indexOf('--port');
  const port = portAt >= 0 ? Number(args.splice(portAt, 2)[1]) : 4100;
  const [folder] = args;
  if (!folder || !Number.isInteger(port)) {
    console.error('Usage: node scripts/labelPhotos.js <photo folder> [--port 4100]');
    process.exit(1);
  }
  const { port: actual, photos, duplicates } = await startLabelServer(folder, port);
  console.log(`Labelling ${photos.length} photos in ${path.resolve(folder)}` + (duplicates.length ? ` (${duplicates.length} duplicates skipped)` : ''));
  console.log(`Open http://localhost:${actual} (only this computer can reach it). Ctrl+C to stop; labels are saved as you go.`);
}
