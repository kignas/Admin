import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'www');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Keep all root-level Admin HTML, CSS, JS, and the web manifest together.
// The Android shell must preserve the existing admin pages and modules.
const files = fs.readdirSync(root).filter((name) => {
  const full = path.join(root, name);
  if (!fs.statSync(full).isFile()) return false;
  return /\.(html|css|js)$/.test(name) || name === 'manifest.json';
});
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(out, file));

const indexPath = path.join(out, 'index.html');
if (!fs.existsSync(indexPath)) throw new Error('Required app file is missing: index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('src="./native-push.js"')) {
  if (!html.includes('</body>')) throw new Error('index.html has no closing body tag.');
  html = html.replace('</body>', '  <script src="./native-push.js"></script>\n</body>');
  fs.writeFileSync(indexPath, html);
}
if (!fs.existsSync(path.join(out, 'native-push.js'))) {
  throw new Error('Required app file is missing: native-push.js');
}
console.log(`Prepared ${files.length} Admin web assets in www/.`);
