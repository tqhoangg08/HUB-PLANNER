# Kiểm chứng — giữ logic cũ, chỉ cập nhật các mục ĐRL

Phạm vi cuối cùng theo yêu cầu chủ dự án ngày 15/10/2026: giữ logic trước PR; chỉ thay phụ lục và danh mục tiêu chí. Base main: 0194b1cdcef558c66e9c4cbf4a2db1cdb298d9e1. Branch: codex/drl-policy-2026-2027. Draft PR #99.

## Thay đổi thực tế

- Hoàn tác toàn bộ thay đổi Worker/API, AI/prediction/cache, candidate review/ingest, EventDetailView, helper form/payload và picker về base. Không còn trường phiên bản/năm học/tìm kiếm hoặc ràng buộc context mới. Nút áp dụng gợi ý hoạt động như trước.
- Đã đối chiếu git diff để xác nhận runtime và các file form/helper nói trên giống base. Với EventsBoard/MobileEvents, so sánh phần mã ngoài ScoreGuideModal cũng giống base (bỏ qua whitespace); chỉ thay phụ lục chung.
- Phụ lục mới có đủ 71 hàng nguồn, 46 tiêu chí, 5 điểm trừ, giới hạn 25/20/20/15/20, ghi chú và Điều 8. Đã bỏ các đoạn giới thiệu/diễn giải và bộ chọn tra cứu theo góp ý trước.
- Một migration dữ liệu 0058_seed_drl_catalog_2026.sql dùng schema hiện có: thêm 46 rule IDs mới, 23 rule event suitable; đặt active=0 cho danh mục cũ. Không sửa điểm/nội dung/ID cũ, không backfill sự kiện hay corpus. Không thêm bảng/cột/index; bỏ hai migrations phiên bản chưa phát hành trước đó.
- Các tests riêng cho luồng phiên bản/năm học đã được thay bằng kiểm tra nguồn và seed dữ liệu vì luồng đó được chủ dự án yêu cầu hoàn tác. Tests baseline được khôi phục nguyên trạng; không skip tests để có kết quả xanh.

## Kiểm tra thực chạy sau khi thu hẹp phạm vi

| Kiểm tra | Kết quả |
|---|---|
| Full npm test | 891 PASS / 0 FAIL / 0 SKIP / 0 CANCELLED, exit 0 |
| Targeted policy/history/workbook/admin mutation/candidate/editor | 50 PASS / 0 FAIL / 0 SKIP |
| Browser: admin-event-create + drl-policy | 5 PASS / 0 FAIL / 0 SKIP; desktop 1440px/mobile 390px; không còn ba trường mới; chọn rule mới lấy đúng mục/điểm; Escape/focus; không tràn ngang |
| Browser DRL chạy lại để chụp picker | 2 PASS / 0 FAIL / 0 SKIP; đã xem ảnh hai kích thước |
| Frontend typecheck | PASS, exit 0 |
| Cloudflare typecheck | PASS, exit 0 |
| Build | PASS, exit 0; Vite + PWA, không deploy |
| git diff --check | PASS |
| D1 local, config/state riêng | PASS: migration/reapply ledger, seed lặp, 46 rules mới, 2.750 history giả lập, điểm admin/public cũ và cache cũ, FK check rỗng |
| SQLite: preservation/idempotency/conflicting IDs | PASS: toàn bộ history/corpus/event/cache/approval/candidate prediction giữ nguyên; old rule chỉ đổi active; schema không đổi; seed xung đột rollback nguyên transaction |
| Word chính thức | PASS: SHA-256 khớp, 71 hàng, 2 ghi chú, 8 khoản Điều 8 |
| Phân trang Word 8–10 trực quan | CHƯA KIỂM CHỨNG; không có LibreOffice |
| D1 production | NOT VERIFIED; không truy vấn hoặc ghi production |

Targeted:

    node --test --experimental-strip-types tests/event-drl-policy.test.ts tests/event-drl-history.test.ts tests/event-drl-workbook.test.mjs tests/cloudflare-admin-events-model.test.ts tests/cloudflare-admin-event-candidates.test.ts tests/admin-event-editor.test.ts

Browser:

    node --test --test-reporter=tap --test-concurrency=1 tests/drl-policy.browser.test.mjs tests/admin-event-create.browser.test.mjs

Lỗi phát hiện và đã sửa trong vòng kiểm tra: so sánh object SQLite có prototype null với object thường trong test preservation; một dòng whitespace của baseline khi hoàn tác. Không thay đổi logic sản phẩm để vượt kiểm thử. Build còn cảnh báo chunk trên 500 kB và Browserslist cũ.

## Giới hạn và quyết định release

Giữ đúng logic baseline đồng nghĩa không bổ sung boundary năm học, cache invalidation theo phiên bản, lưu snapshot candidate hoặc xử lý mới khi sửa event có rule inactive. Các hạn chế đã nêu trong audit vẫn còn; không tuyên bố AI an toàn theo phiên bản. Danh mục được chuyển bằng dữ liệu active, không tự quy đổi observed code hoặc cập nhật history. Các bước staging/rollback và snapshot danh mục cần làm trước release được ghi trong [kế hoạch release](drl-policy-2026-release.md).

Đối chiếu nội dung và các điểm nghiệp vụ cần chủ dự án quyết định nằm trong [bảng nguồn](drl-policy-2026-crosswalk.md). Kết quả bảo toàn trên local không chứng minh số dòng hoặc nội dung D1 production. Production chưa thay đổi; không merge, deploy, push main, chạm Auth Worker/AI Advisor rollout/PR #88/Student Directory/ranking. Không commit Word, workbook thô, dữ liệu cá nhân hoặc secret.

## Danh sách file cuối cùng so với base

- cloudflare/migrations/0058_seed_drl_catalog_2026.sql
- components/DrlScoreGuide.tsx
- components/EventsBoard.tsx
- components/MobileEvents.tsx
- utils/drlPolicy2026.ts
- package.json
- scripts/build-drl-policy-seed.mjs
- scripts/test-drl-policy-d1-local.mjs
- scripts/verify-drl-policy-source.py
- tests/event-drl-policy.test.ts
- tests/drl-policy-harness.html
- tests/drl-policy-harness.tsx
- tests/drl-policy.browser.test.mjs
- docs/drl-policy-2026-audit.md
- docs/drl-policy-2026-crosswalk.md
- docs/drl-policy-2026-release.md
- docs/drl-policy-2026-validation.md
