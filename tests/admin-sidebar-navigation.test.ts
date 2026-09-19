import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');

test('admin navigation separates overview from the cursor-backed student manager', () => {
  const routes = read('app/routing/ProtectedAppRoutes.tsx');
  const dashboard = read('components/Dashboard.tsx');
  assert.match(routes, /path="\/admin\/students\/\*"[\s\S]*?isAdmin/);
  assert.match(routes, /path="\/dashboard\/admin\/\*" element={<Navigate to="\/admin\/students" replace/);
  assert.match(dashboard, /const isStudentManagementRoute = location\.pathname === '\/admin\/students'/);
  assert.match(dashboard, /showAdminPanel = isAdmin && adminMode === 'list' && isStudentManagementRoute/);
});

test('admin sidebar preserves only real routes in the requested hierarchy', () => {
  const sidebar = read('layouts/DesktopLayout.tsx');
  for (const label of ['TỔNG QUAN', 'QUẢN LÝ', 'HỌC TẬP', 'NỘI DUNG & SỰ KIỆN', 'VẬN HÀNH', 'KIỂM DUYỆT', 'HỖ TRỢ', 'DỮ LIỆU', 'HỆ THỐNG', 'Tri thức AI', 'Nhật ký hoạt động', 'Duyệt sự kiện', 'Báo cáo & vi phạm', 'Ticket hỗ trợ', 'Tài khoản nội bộ']) {
    assert.match(sidebar, new RegExp(label));
  }
  assert.match(sidebar, /aria-expanded=\{expanded\}/);
  assert.match(sidebar, /isAdminSidebarCollapsed/);
  assert.match(sidebar, /aria-label="Tổng quan"/);
  assert.match(sidebar, /\? 'Quản lý sinh viên'/);
  assert.doesNotMatch(sidebar, /to="\/admin\/(?:roles|settings)"/);
});

test('admin sidebar badges are count based and do not alter backend authorization', () => {
  const sidebar = read('layouts/DesktopLayout.tsx');
  const routes = read('app/routing/ProtectedAppRoutes.tsx');
  const shell = read('app/shell/ProtectedAppShell.tsx');
  assert.match(sidebar, /pendingCandidateCount > 0/);
  assert.match(sidebar, /pendingReportCount > 0/);
  assert.match(routes, /admin\/internal-accounts[\s\S]*?isAdmin/);
  assert.match(routes, /admin\/event-candidates[\s\S]*?isManagementUser/);
  assert.match(routes, /if \(mobileLayout && !isManagementUser\)/);
  assert.match(shell, /mobileLayout && !isAdmin && !isAuditor/);
});
