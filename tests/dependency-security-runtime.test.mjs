import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import test from 'node:test';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import axios from 'axios';
import FormData from 'form-data';
import {load} from 'cheerio';
import {fetch as undiciFetch} from 'undici';
import {expand} from 'brace-expansion';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter, Link, Route, Routes, useLocation} from 'react-router-dom';
import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';

test('SPA routes retain Vietnamese query state and nested login return paths', () => {
  const location = '/scholarships?major=K%E1%BA%BF+to%C3%A1n&cohort=K24&page=2';
  function Probe() {
    const current = useLocation();
    const query = new URLSearchParams(current.search);
    assert.equal(query.get('major'), 'Kế toán');
    assert.equal(query.get('cohort'), 'K24');
    assert.equal(query.get('page'), '2');
    return React.createElement(Link, {to: `/login?redirect=${encodeURIComponent(current.pathname + current.search)}`}, 'Đăng nhập');
  }
  const html = renderToStaticMarkup(React.createElement(MemoryRouter, {initialEntries: [location]},
    React.createElement(Routes, null, React.createElement(Route, {path: '/scholarships', element: React.createElement(Probe)}))));
  assert.match(html, /href="\/login\?redirect=%2Fscholarships%3F/);
  assert.match(html, /Đăng nhập/);
});

test('patched HTTP clients retain JSON and Vietnamese multipart uploads on loopback', async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({url: req.url, contentType: req.headers['content-type'], body: Buffer.concat(chunks).toString()});
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ok: true, title: 'Quy chế học bổng'}));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await axios.get(`${base}/documents`, {params: {q: 'Kế toán'}, timeout: 2000, proxy: false});
  assert.equal(response.data.title, 'Quy chế học bổng');
  assert.equal(new URL(requests[0].url, base).searchParams.get('q'), 'Kế toán');
  const form = new FormData();
  form.append('document', Buffer.from('Nội dung tổng hợp'), {filename: 'quy-che.txt', contentType: 'text/plain'});
  await axios.post(`${base}/import`, form, {headers: form.getHeaders(), timeout: 2000, maxBodyLength: 4096, proxy: false});
  assert.match(requests[1].contentType, /^multipart\/form-data; boundary=/);
  assert.match(requests[1].body, /Nội dung tổng hợp/);
  const hostile = new FormData();
  hostile.append('document\r\nInjected: yes', Buffer.from('synthetic'), {filename: 'test\r\nInjected: yes.txt'});
  const serialized = hostile.getBuffer().toString();
  assert.doesNotMatch(serialized, /\r\nInjected:/);
  assert.match(serialized, /name="document%0D%0AInjected: yes"/);
  assert.equal((await (await undiciFetch(`${base}/health`)).json()).ok, true);
});

test('document HTML parsing and glob expansion retain normal import behavior', () => {
  const html = '<table><tr><td>000000000001</td><td>Kế toán</td></tr></table>';
  assert.deepEqual(load(html)('td').map((_, element) => load(html)(element).text()).get(), ['000000000001', 'Kế toán']);
  assert.deepEqual(expand('imports/{csv,xlsx}'), ['imports/csv', 'imports/xlsx']);
});

test('transcript PDF export still produces a valid document with tables', () => {
  const doc = new jsPDF();
  autoTable(doc, {head: [['Course', 'Credits']], body: [['Synthetic course', '3']]});
  const output = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  assert.ok(output.startsWith('%PDF-'));
  assert.ok(output.includes('Synthetic course'));
  assert.ok(output.trimEnd().endsWith('%%EOF'));
});

test('actual advisor renderer rejects raw HTML and unsafe links while preserving GFM', async (t) => {
  await mkdir('.cache/dependency-security', {recursive: true});
  const temporary = await mkdtemp(resolve('.cache/dependency-security/render-'));
  t.after(() => rm(temporary, {recursive: true, force: true}));
  const outfile = resolve(temporary, 'message.mjs');
  await build({entryPoints: ['components/AIMessageContent.tsx'], outfile, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent'});
  const {AIMessageContent} = await import(pathToFileURL(outfile).href);
  const html = renderToStaticMarkup(React.createElement(AIMessageContent, {content: [
    '<img src=x onerror=alert(1)>',
    '',
    '[unsafe](javascript:alert%281%29)',
    '[valid](https://example.test/rules)',
    '',
    '| Ngành | Khóa |', '| --- | --- |', '| Kế toán | K24 |',
  ].join('\n')}));
  assert.doesNotMatch(html, /<img\b|<script\b|href="javascript:/i);
  assert.match(html, /href="https:\/\/example\.test\/rules" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /<table\b/);
  assert.match(html, /Kế toán/);
});
