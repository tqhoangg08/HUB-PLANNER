import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

// Real hook + preview + integrity guard, with all external I/O replaced.
test('desktop preview and both hook write paths reject partial imports, preserve M/null, and accept complete data', { timeout: 120000 }, async () => {
    const bundled = await build({ entryPoints: ['tests/browser/transcript-import-entry.tsx'], bundle: true, write: false, platform: 'browser', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty' }, plugins: [{
        name: 'isolate-import-io', setup(build) {
            build.onResolve({ filter: /utils\/(pdfImport|audio|appNotifications|logWebError|parserDebugTicket)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'test-io' }));
            build.onLoad({ filter: /.*/, namespace: 'test-io' }, args => ({ contents: {
                pdfImport: 'export const parseHubPdf = async () => globalThis.__transcriptParsed;',
                audio: 'export const playClick = () => {};',
                appNotifications: 'export const showAlert = async message => { globalThis.__lastAlert = message; };',
                logWebError: 'export const logWebError = async () => { throw new Error("Unexpected external logging"); };',
                parserDebugTicket: 'export const promptSendParserDebugFile = async () => { throw new Error("Unexpected upload"); };',
            }[args.path] }));
        },
    }] });
    const cssName = readdirSync('dist/assets').find(name => name.startsWith('index-') && name.endsWith('.css'));
    assert.ok(cssName, 'Run build before browser regression tests');
    const css = readFileSync(`dist/assets/${cssName}`);
    const server = createServer((req, res) => {
        if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundled.outputFiles[0].text); }
        else if (req.url === '/app.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
        else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="vi"><meta charset="UTF-8"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script></html>'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        const url = `http://127.0.0.1:${server.address().port}`;
        for (const path of ['saved', 'draft']) {
            await page.goto(url);
            await page.getByRole('button', { name: `Load ${path}`, exact: true }).click();
            const confirm = page.getByRole('button', { name: 'Xác nhận nhập', exact: true });
            await confirm.waitFor();
            assert.equal(await confirm.isEnabled(), true);
            assert.equal(await page.locator('section').count(), 5);
            assert.equal(await page.locator('input').filter({ visible: true }).count(), 126);
            assert.equal(await page.locator('input').evaluateAll(inputs => inputs.filter(i => i.value === 'M').length), 4);
            assert.equal(await page.locator('section').last().locator('input[placeholder="-"]').evaluateAll(inputs => inputs.every(i => i.value === '')), true);
            await page.getByRole('button', { name: 'Truncate semesters', exact: true }).click();
            assert.equal(await confirm.isDisabled(), true);
            assert.match(await page.getByRole('alert').innerText(), /5 học kỳ \/ 42 môn.*1 học kỳ \/ 11 môn/);
            await page.getByRole('button', { name: 'Force confirm guard', exact: true }).click();
            assert.equal(await page.getByTestId('saved').innerText(), '1');
            assert.equal(await page.getByTestId('writes').innerText(), '0');
            assert.equal(await page.getByTestId('drafts').innerText(), '0');
            await page.getByRole('button', { name: 'Hủy', exact: true }).click();
            await page.getByRole('button', { name: `Load ${path}`, exact: true }).click();
            await confirm.waitFor();
            await page.getByRole('button', { name: 'Drop course', exact: true }).click();
            assert.equal(await confirm.isDisabled(), true);
            await page.getByRole('button', { name: 'Force confirm guard', exact: true }).click();
            assert.equal(await page.getByTestId('saved').innerText(), '1');
            await page.getByRole('button', { name: 'Hủy', exact: true }).click();
            await page.getByRole('button', { name: `Load ${path}`, exact: true }).click();
            await confirm.waitFor(); await confirm.click();
            await page.waitForFunction(() => document.querySelector('[data-testid="saved"]').textContent === '42');
            assert.equal(await page.getByTestId('writes').innerText(), path === 'saved' ? '1' : '0');
            assert.equal(await page.getByTestId('drafts').innerText(), path === 'draft' ? '1' : '0');
        }
        assert.deepEqual(errors, []);
    } finally {
        await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    }
});
