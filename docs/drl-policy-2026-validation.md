# Kiểm chứng — giữ logic cũ, chỉ cập nhật các mục ĐRL

Phạm vi cuối cùng theo yêu cầu chủ dự án ngày 15/10/2026: giữ logic trước PR; chỉ thay phụ lục và danh mục tiêu chí. Base main: 0194b1cdcef558c66e9c4cbf4a2db1cdb298d9e1. Branch: codex/drl-policy-2026-2027. Draft PR #99.

## Thay đổi thực tế

- Hoàn tác thay đổi nghiệp vụ Worker/API, AI/prediction/cache, candidate review/ingest, EventDetailView và helper form/payload về base. Không còn trường phiên bản/năm học/tìm kiếm hoặc ràng buộc context mới. Nút áp dụng gợi ý hoạt động như trước.
- Worker, AI/cache và payload quản trị vẫn giống base. Theo góp ý tiếp theo, popup đóng góp bỏ hai trường mở đăng ký, điều chỉnh cỡ chữ/chiều cao trường và xử lý trạng thái lỗi/tải lại danh mục; không đổi cách chọn rule, điểm hoặc áp dụng gợi ý.
- Phụ lục mới có đủ 71 hàng nguồn, 46 tiêu chí, 5 điểm trừ, giới hạn 25/20/20/15/20, ghi chú và Điều 8. Đã bỏ các đoạn giới thiệu/diễn giải và bộ chọn tra cứu theo góp ý trước.
- Một migration dữ liệu 0058_seed_drl_catalog_2026.sql dùng schema hiện có: thêm 46 rule IDs mới, 23 rule event suitable; đặt active=0 cho danh mục cũ. Không sửa điểm/nội dung/ID cũ, không backfill sự kiện hay corpus. Không thêm bảng/cột/index; bỏ hai migrations phiên bản chưa phát hành trước đó.
- Các tests riêng cho luồng phiên bản/năm học đã được thay bằng kiểm tra nguồn và seed dữ liệu vì luồng đó được chủ dự án yêu cầu hoàn tác. Tests baseline được khôi phục nguyên trạng; không skip tests để có kết quả xanh.

## Kiểm tra thực chạy sau khi thu hẹp phạm vi

| Kiểm tra | Kết quả |
|---|---|
| Full npm test | 891 PASS / 0 FAIL / 0 SKIP / 0 CANCELLED, exit 0 tại commit 69d33dc; trước lần sửa typography và trạng thái tải danh mục |
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

- components/EventContributionTimeFields.tsx
- index.css
- components/EventDrlAssistant.tsx
- components/AdminEventEditorPage.tsx
- components/AdminEventCandidates.tsx
- utils/eventDrlApi.ts
- tests/event-contribution-harness.html
- tests/event-contribution-harness.tsx
- tests/event-contribution-catalog.browser.test.mjs
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

## Góp ý tiếp theo: cỡ chữ và danh mục đơn vị tổ chức

- Đã kiểm tra endpoint localhost khi không gửi phiên đăng nhập: catalog trả HTTP 401; get-session trả null. API hiện có yêu cầu đăng nhập cho danh mục, không phải bằng chứng bảng đơn vị bị mất dữ liệu. Không truy vấn/ghi D1 production để suy số lượng đơn vị; không đổi Auth Worker hoặc nới quyền endpoint.
- Trước sửa, các nhãn text-xs, control text-sm và control kế thừa trộn nhiều cỡ chữ. Font gốc ứng dụng là 14px, nên text-sm thực tế là 12,25px. Form đóng góp/sửa sự kiện, picker, chứng nhận và nhãn liên quan đã đồng bộ text-base = 14px trong ứng dụng; phần mô tả phụ giữ cỡ nhỏ có chủ đích.
- Hook chỉ bổ sung trạng thái đang tải/401/lỗi/tải thành công và retry GET catalog. Hiển thị yêu cầu đăng nhập, lỗi dịch vụ và nút tải lại thay vì để danh sách rỗng rồi báo không tìm thấy. Không thay nội dung đang nhập, rule/điểm đã chọn hoặc payload. Nhập đơn vị khác vẫn hoạt động như trước.
- Kiểm tra sau lần sửa này: 16 targeted tests PASS/0 FAIL/0 SKIP; 7 browser tests PASS/0 FAIL/0 SKIP (ba file admin-event-create, drl-policy và event-contribution-catalog); frontend typecheck/build/diff check PASS. Full suite 891 và Cloudflare/migration trong bảng trên là kết quả trước lần sửa hiển thị/lỗi tải này, không chạy lại.
- Browser dùng form EventsBoard/MobileEvents thực, đo computed font-size của label/input/select/textarea ở 1440px và 390px, kiểm 401 → 503 → thành công khi retry, giữ nội dung nhập, tìm/chọn đơn vị, chọn rule và không gửi mutation. Response thành công dùng fixture, không tuyên bố đã đọc danh mục production bằng phiên người dùng. Đã xem ảnh hai kích thước.
- Trong quá trình kiểm tra, đã sửa test navigation đang chờ load tài nguyên thay vì DOMContentLoaded và selector trạng thái có chứa nút con; kiểm computed style phát hiện text-sm nhỏ hơn dự tính và đã sửa cỡ chữ sản phẩm. Không bỏ hoặc skip kiểm tra thất bại.

## Góp ý cuối: popup đóng góp gọn và thẳng hàng

- Bỏ Ngày mở ĐK/Giờ mở ĐK trong popup đóng góp desktop/mobile, bỏ hai giá trị này khỏi state khởi tạo/reset và payload đóng góp. Dữ liệu mở đăng ký đã lưu của event cũ, form quản trị/sửa event và schema vẫn giữ nguyên. Nháp mobile cũ có thuộc tính mở đăng ký không bị đưa ngầm vào payload mới.
- Bốn ô thời gian còn lại dùng chung component trình bày với các cột bằng nhau: bốn cột ở màn hình rộng, hai cột khi hẹp; giữ nhãn thời gian cho nhánh minigame và cơ chế vô hiệu hóa deadline khi đóng đủ số lượng.
- CSS chỉ áp dụng trong popup đóng góp: chữ 13px, tiêu đề 15px, control cao 38px, nhãn/các hàng select thẳng nhau. Giữ khoảng đệm cho icon link; bỏ icon trang trí BTC bị lệch khi hiển thị lỗi danh mục. Không giảm cỡ chữ các màn hình khác.
- Kiểm tra lần này: 3 browser tests PASS/0 FAIL/0 SKIP tại 1440px, 620px và 390px; 16 targeted tests PASS/0 FAIL/0 SKIP; frontend typecheck, build (Vite + PWA, exit 0) và diff check PASS. Full suite/Cloudflare/migration không chạy lại cho thay đổi popup này.
- Browser đo font thực tế 13px, chiều cao/chiều rộng/tọa độ các ô thời gian và select cùng hàng; xác nhận hai trường mở đăng ký vắng mặt, dữ liệu thời gian giữ nguyên khi đổi loại hình, close-on-full, trạng thái lỗi/retry danh mục và phần đệm icon. Đã xem ảnh desktop/hẹp/mobile.
- Trong vòng kiểm tra đã sửa selector checkbox của test và chụp sau khi kết thúc animation để đo đúng tọa độ; phép kiểm icon phát hiện selector CSS padding quá mạnh, đã sửa specificity và chạy lại đủ ba kích thước. Không bỏ hay skip assertion thất bại.
