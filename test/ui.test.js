// Browser tests for the page (src/app.js), run in headless Chrome. No dependencies.
// Run: npm run test:ui   (skipped when no Chrome/Chromium is installed; set CHROME=/path to choose one)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const url = file => 'file://' + path.join(ROOT, file);

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    try { return execFileSync('which', [name], { encoding: 'utf8' }).trim(); } catch { /* try the next one */ }
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.log('ui tests skipped: Chrome/Chromium not found (set CHROME=/path/to/chrome)');
  process.exit(0);
}

// The real page, loading the source files by absolute URL, plus the checks.
const page = fs.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8')
  .replace('href="style.css"', 'href="' + url('src/style.css') + '"')
  .replace('src="diff.js"', 'src="' + url('src/diff.js') + '"')
  .replace('src="app.js"', 'src="' + url('src/app.js') + '"')
  .replace('</body>', '<pre id="out"></pre>\n<script src="' + url('test/ui-checks.js') + '"></script>\n</body>');
const tmp = path.join(os.tmpdir(), 'text-diff-ui-' + process.pid + '.html');
fs.writeFileSync(tmp, page);

const args = ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--virtual-time-budget=120000', '--dump-dom', 'file://' + tmp];
if (process.getuid && process.getuid() === 0) args.unshift('--no-sandbox');
let dom;
try {
  dom = execFileSync(chrome, args, { encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
} finally {
  fs.unlinkSync(tmp);
}

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
const text = m && m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
let res;
try { res = JSON.parse(text); } catch { console.log('ui tests did not finish; page output:\n' + (text || dom.slice(-2000))); process.exit(1); }
for (const f of res.failures) console.log('FAIL', f.name, '\n ', f.error);
console.log(res.pass + ' ui passed' + (res.failures.length ? ', ' + res.failures.length + ' failed' : ''));
process.exit(res.failures.length ? 1 : 0);
