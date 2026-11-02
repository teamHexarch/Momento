// node screenshot.mjs <url> [label] [width] [height]
// Saves to "./temporary screenshots/screenshot-N[-label].png" using headless Chrome/Edge.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [url = 'http://localhost:3000', label, width = '1440', height = '3600'] = process.argv.slice(2);
const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'temporary screenshots');
fs.mkdirSync(outDir, { recursive: true });

const n = fs.readdirSync(outDir)
  .map(f => +(f.match(/^screenshot-(\d+)/)?.[1] ?? 0))
  .reduce((a, b) => Math.max(a, b), 0) + 1;
const out = path.join(outDir, `screenshot-${n}${label ? '-' + label : ''}.png`);

const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];
const browser = browsers.find(b => fs.existsSync(b));
if (!browser) throw new Error('No Chrome or Edge found');

execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars',
  `--window-size=${width},${height}`, '--virtual-time-budget=6000',
  `--screenshot=${out}`, url,
], { stdio: 'ignore' });
console.log(out);
