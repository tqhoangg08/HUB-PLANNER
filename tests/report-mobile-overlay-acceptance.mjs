// Create bounded, reviewable evidence from an already completed acceptance run.
// Raw before/during/after, landscape and compact screenshots stay in .cache.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium, webkit } from 'playwright-core';
import { scenes } from './mobile-overlay-scenes.mjs';

const destination = path.resolve('docs/qa/overlay-116');
await fs.mkdir(destination, { recursive: true });
const checks = JSON.parse(await fs.readFile('.cache/final-validation.json', 'utf8'));
const browserChecks = JSON.parse(await fs.readFile('.cache/final-browser-validation.json', 'utf8'));
if (checks.length !== 6 || browserChecks.length !== 3 || [...checks, ...browserChecks].some(check => check.exitCode !== 0)) throw new Error('Required command validation is incomplete or failing');
const validation = [];
for (const check of [...checks, ...browserChecks]) {
  const bytes = await fs.readFile(check.log);
  const log = bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.subarray(2).toString('utf16le') : bytes.toString('utf8');
  const filename = path.basename(check.log);
  const normalized = log.replaceAll('\r\n', '\n').trimEnd();
  await fs.writeFile(path.join(destination, filename), normalized ? normalized + '\n' : '');
  validation.push({ ...check, log: filename });
}
await fs.writeFile(path.join(destination, 'validation.json'), JSON.stringify(validation, null, 2) + '\n');
const engines = [
  ['chromium', '.cache/chromium-acceptance-verified', 4],
  ['webkit', '.cache/webkit-acceptance-final', 2],
];
const summary = { main: execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim(), realDeviceAcceptance: 'NOT VERIFIED', sourceHashFormat: 'SHA-256 of UTF-8 source with CRLF normalized to LF', validation, engines: [], samples: [], screenshots: [], sourceFiles: [] };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
summary.chromiumVersion = browser.version();
const wk = await webkit.launch(); summary.webkitVersion = wk.version(); await wk.close();
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
for (const [engine, directory, deviceCount] of engines) {
  const data = JSON.parse(await fs.readFile(path.join(directory, 'results.json'), 'utf8'));
  if (data.results.length !== scenes.length * deviceCount || data.results.some(row => row.status !== 'PASS')) throw new Error(`${engine}: incomplete or failing matrix`);
  if (new Set(data.results.map(row => `${row.device}:${row.scene}`)).size !== data.results.length) throw new Error('Duplicate result');
  summary.engines.push({ engine, scenarios: data.results.length, allPassed: true, groups: [], results: data.results });
  const report = summary.engines.at(-1);
  for (const row of data.results) for (const variant of ['before', 'during', 'after', 'landscape', 'compact']) {
    const file = path.join(directory, row.device, `${row.scene}-${variant}.png`);
    try {
      const bytes = await fs.readFile(file);
      summary.screenshots.push({ engine, device: row.device, scene: row.scene, variant, path: file.replaceAll('\\', '/'), sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    } catch (error) { if (variant === 'before' || variant === 'during' || variant === 'after' || error.code !== 'ENOENT') throw error; }
  }
  const sampleDevice = engine === 'chromium' ? 'android360' : 'iphoneSE';
  await fs.mkdir(path.join(destination, 'samples'), { recursive: true });
  for (const [scene, variants] of [
    ['SchoolAnnouncements-1', ['before', 'during', 'after', 'compact']],
    ['DrlScoreGuide-1', ['during']], ['EventFilterControls-1', ['during']],
    ['MobileSchedule-8', ['compact']], ['FloatingSupportTab-1', ['compact']],
  ]) for (const variant of variants) {
    const name = `${engine}-${sampleDevice}-${scene}-${variant}.png`;
    await fs.copyFile(path.join(directory, sampleDevice, `${scene}-${variant}.png`), path.join(destination, 'samples', name));
    summary.samples.push({ engine, device: sampleDevice, scene, variant, path: `samples/${name}` });
  }
  for (const device of [...new Set(data.results.map(row => row.device))]) for (const group of [...new Set(data.results.map(row => row.group))]) {
    const rows = data.results.filter(row => row.device === device && row.group === group);
    if (!rows.length) continue;
    let images = '';
    for (const row of rows) {
      const file = path.join(directory, row.device, `${row.scene}-during.png`);
      images += `<figure><figcaption>${escape(row.scene)} · PASS</figcaption><img src="data:image/png;base64,${(await fs.readFile(file)).toString('base64')}" /></figure>`;
    }
    let comparison = '';
    const example = rows[0];
    for (const variant of ['before', 'during', 'after']) comparison += `<figure><figcaption>${escape(example.scene)} · ${variant}</figcaption><img src="data:image/png;base64,${(await fs.readFile(path.join(directory, device, `${example.scene}-${variant}.png`))).toString('base64')}" /></figure>`;
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#edf2f8;color:#10213e;font:13px Arial}h1{font-size:20px}h2{font-size:16px}section{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}section.comparison{grid-template-columns:repeat(3,1fr)}figure{margin:0;background:white;padding:5px;border:1px solid #b9c6d7}figcaption{height:30px;overflow-wrap:anywhere;font-weight:bold}img{display:block;width:100%;height:auto}</style><h1>${engine} · ${device} · ${group}</h1><p>Local isolated production components. Emulation; not a real device. All ${rows.length} scenes passed.</p><section>${images}</section><h2>Before / during / after (representative)</h2><section class="comparison">${comparison}</section>`);
    await page.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    const file = `${engine}-${device}-${group}.png`;
    await page.screenshot({ path: path.join(destination, file), fullPage: true });
    report.groups.push({ device, group, cases: rows.length, screenshot: file });
  }
}
await browser.close();
const sourceFiles = execFileSync('git', ['diff', '--name-only', 'origin/main', '--', 'components', 'hooks', 'layouts', 'utils', 'features', 'app', 'index.css', 'package.json', 'tests'], { encoding: 'utf8' }).trim().split(/\r?\n/);
for (const file of sourceFiles.filter(Boolean)) summary.sourceFiles.push({ path: file, sha256: crypto.createHash('sha256').update((await fs.readFile(file, 'utf8')).replaceAll('\r\n', '\n')).digest('hex') });
await fs.writeFile(path.join(destination, 'acceptance.json'), JSON.stringify(summary, null, 2) + '\n');
let markdown = '# Mobile overlay automated acceptance evidence\n\nReal device acceptance: **NOT VERIFIED**. These are local emulated browser runs.\n\n';
markdown += '## Executed command logs\n\n| Command | Result | Log |\n| --- | --- | --- |\n';
for (const check of validation) markdown += `| ${check.command} | PASS (exit 0) | [log](${check.log}) |\n`;
markdown += '\n';
markdown += '## Full-resolution samples\n\n| Engine / device | Scene / viewport | Screenshot |\n| --- | --- | --- |\n';
for (const sample of summary.samples) markdown += `| ${sample.engine} / ${sample.device} | ${sample.scene} / ${sample.variant} | [image](${sample.path}) |\n`;
markdown += '\n';
for (const engine of summary.engines) {
  markdown += `## ${engine.engine}: ${engine.scenarios} scenarios PASS\n\n| Device | Group | Cases | Screenshots |\n| --- | --- | ---: | --- |\n`;
  for (const row of engine.groups) markdown += `| ${row.device} | ${row.group} | ${row.cases} | [contact sheet](${row.screenshot}) |\n`;
  markdown += '\n';
}
markdown += 'The JSON report retains individual geometry, input/date/time checks, reachable primary actions, warnings, isolated API requests and SHA-256 paths for every raw screenshot. Raw full-size screenshots are retained under the recorded local `.cache` directories. Contact sheets include all modal scenes and a representative before/during/after sequence per device and group.\n';
await fs.writeFile(path.join(destination, 'README.md'), markdown);
console.log(`Evidence saved: ${destination}; ${summary.screenshots.length} raw screenshots`);
