import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const cacheDir = path.join(root, '.cache', 'cloudflare');
const wranglerEntry = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

await mkdir(cacheDir, { recursive: true });

const child = spawn(process.execPath, [wranglerEntry, ...process.argv.slice(2)], {
  cwd: root,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: path.join(cacheDir, 'xdg'),
    WRANGLER_LOG_PATH: path.join(cacheDir, 'wrangler.log'),
  },
  stdio: 'inherit',
});

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});

process.exitCode = exitCode;
