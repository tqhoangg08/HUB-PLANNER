import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright-core';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const base = `${server.resolvedUrls.local[0]}tests/admin-operations-dashboard-harness.html`;
test.after(async () => { await browser.close(); await server.close(); });

test('admin sees operational KPIs, work queue, system health and authorized actions', async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('heading', { name: 'Tổng quan vận hành' }).waitFor();
    for (const name of ['Công việc cần xử lý', 'Sự kiện gần đây', 'Kiểm duyệt & an toàn', 'Hỗ trợ', 'Dữ liệu & đồng bộ', 'Hoạt động hệ thống gần đây', 'Sinh viên', 'Thông báo trường']) assert.equal(await page.getByRole('region', { name }).count(), 1);
    assert.equal(await page.getByText('Điều hành hệ thống').count(), 0);
    assert.equal(await page.getByRole('navigation', { name: 'Thao tác nhanh' }).getByRole('link', { name: /Quản lý sinh viên/ }).count(), 1);
    assert.equal(await page.getByRole('link', { name: /Trung tâm dữ liệu/ }).count(), 2);
    assert.match(await page.getByRole('region', { name: 'Chỉ số vận hành' }).innerText(), /120[\s\S]*12[\s\S]*1[\s\S]*1[\s\S]*4/);
    assert.match(await page.getByRole('region', { name: 'Sinh viên' }).innerText(), /120[\s\S]*94[\s\S]*26[\s\S]*3/);
    assert.equal(await page.getByRole('link', { name: /Xem nguồn/ }).getAttribute('href'), 'https://hub.edu.vn/notice');
    assert.equal(await page.locator('[class*="shadow-"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('auditor sees moderation-focused dashboard without admin-only system or student actions', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(`${base}?role=auditor`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('heading', { name: 'Tổng quan kiểm duyệt' }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Dữ liệu & đồng bộ' }).count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Sinh viên' }).count(), 0);
    assert.equal(await page.getByRole('link', { name: /Quản lý sinh viên/ }).count(), 0);
    assert.equal(await page.getByRole('link', { name: /Trung tâm dữ liệu/ }).count(), 0);
    assert.equal(await page.getByText('admin@example.test').count(), 0);
    assert.equal(await page.getByRole('region', { name: 'Công việc cần xử lý' }).count(), 1);
    assert.equal(await page.getByRole('region', { name: 'Hoạt động hệ thống gần đây' }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('admin mobile layout stays within viewport and keeps student/data sections', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('heading', { name: 'Tổng quan vận hành' }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Sinh viên' }).count(), 1);
    assert.equal(await page.getByRole('region', { name: 'Dữ liệu & đồng bộ' }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

test('missing authoritative data shows unavailable states, never invented zeroes', async () => {
  const page = await browser.newPage({ viewport: { width: 768, height: 850 } });
  try {
    await page.goto(`${base}?empty=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('heading', { name: 'Tổng quan vận hành' }).waitFor();
    assert.match(await page.getByRole('region', { name: 'Công việc cần xử lý' }).innerText(), /Chưa tải được hàng đợi/);
    assert.match(await page.getByRole('region', { name: 'Sự kiện gần đây' }).innerText(), /Chưa tải được dữ liệu sự kiện/);
    assert.doesNotMatch(await page.getByRole('region', { name: 'Chỉ số vận hành' }).innerText(), /\b0\b/);
  } finally { await page.close(); }
});

test('student dashboard route remains on the existing component branch', () => {
  const routes = readFileSync('app/routing/ProtectedAppRoutes.tsx', 'utf8');
  const dashboard = readFileSync('components/Dashboard.tsx', 'utf8');
  assert.match(routes, /isManagementUser \? <AdminOperationsDashboard isAdmin=\{isAdmin\} isAuditor=\{isAuditor\} \/> : <Dashboard/);
  assert.match(dashboard, /export const Dashboard: React\.FC<DashboardProps>/);
  const operations = readFileSync('components/AdminOperationsDashboard.tsx', 'utf8');
  assert.match(operations, /if \(role === 'admin'\) \{/);
  assert.match(operations, /fetchAdminStudentSummary\(\)/);
  assert.match(operations, /fetchCloudflareHealth\(\)/);
  assert.doesNotMatch(operations, /shadow-(?:lg|xl|2xl)/);
});
