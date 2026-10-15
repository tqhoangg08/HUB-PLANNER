# Bàn giao và kiểm chứng ĐRL 2026

Ngày kiểm tra: 15/10/2026, Asia/Saigon. Base đã fetch lại trước bàn giao và vẫn là `0194b1cdcef558c66e9c4cbf4a2db1cdb298d9e1`. Feature branch: `codex/drl-policy-2026-2027`.

## Kết quả thực chạy

| Kiểm tra | Kết quả | Phạm vi và giới hạn |
|---|---|---|
| `npm test` | 900 PASS / 0 FAIL / 0 SKIP | Toàn bộ chuỗi test thực sự được chạy, mã thoát 0 |
| Targeted: policy/history/workbook/admin mutation/candidate/editor | 59 PASS / 0 FAIL / 0 SKIP | Bao gồm đầy đủ điểm, vai trò/cấp/đơn vị/điểm trừ, source integrity, năm học, bảo toàn snapshot, auth, ingest, stale/retry/audit |
| Browser: `admin-event-create.browser.test.mjs` + `drl-policy.browser.test.mjs` | 5 PASS / 0 FAIL / 0 SKIP | Chrome headless; 1440px và 390px; Admin/Auditor/user; preview nguồn/năm/đơn vị; 5 mục/64 hàng nội dung; Escape/focus; không tràn ngang; đổi năm không âm thầm đổi policy |
| `npm run typecheck` | PASS, exit 0 | Frontend, gồm thay đổi chi tiết sự kiện cuối cùng |
| `npm run cf:typecheck` | PASS, exit 0 | Cloudflare Worker |
| `npm run build` | PASS, exit 0 | Vite + PWA build; không deploy |
| `git diff --check` | PASS | Không có lỗi whitespace; Git có thông báo chuẩn hóa LF/CRLF cho package.json |
| `node scripts/test-drl-policy-d1-local.mjs` | PASS | D1 local riêng; 2.750 history giả lập giữ nguyên; 46 rules mới; điểm admin/public cũ = 10; cache cũ còn; ledger apply lần hai không còn migration; seed lặp; FK check rỗng |
| `scripts/verify-drl-policy-source.py` với Word gốc | PASS | SHA-256 khớp; 71 hàng bảng cuối; quyết định/ngày/năm; 2 ghi chú; 8 khoản Điều 8 |
| Render/kiểm tra phân trang Word bằng LibreOffice | CHƯA KIỂM CHỨNG | Renderer trả `FileNotFoundError: LibreOffice soffice.exe was not found on PATH`; không tuyên bố PASS trang 8–10 trực quan |
| Đếm/so sánh D1 production | NOT VERIFIED | Không chạy truy vấn hoặc ghi production; 2.750/44/31 là số đã kiểm **workbook cục bộ**, không phải số D1 |

Chi tiết 900 tests của full suite: scholarships 17; advisor 459; Word usability 22; student directory 16; recovery 3; event DRL 18; unit 339; authority checks 25; read optimization 1. Không thay cấu hình AI Advisor, Student Directory, ranking hoặc Auth để đạt kết quả này.

Sau yêu cầu tinh gọn modal, đã chạy lại `npm run test:event-drl`: 18 PASS/0 FAIL/0 SKIP; hai file browser nêu trên: 5 PASS/0 FAIL/0 SKIP; frontend typecheck, build và diff check đều PASS. Đã xem ảnh desktop 1440px/mobile 390px. Full suite 900 tests, Cloudflare typecheck và migration local trong bảng là kết quả trước thay đổi hiển thị này, không chạy lại cho lần tinh gọn modal.

Targeted command:

```sh
node --test --experimental-strip-types tests/event-drl-policy.test.ts tests/event-drl-history.test.ts tests/event-drl-workbook.test.mjs tests/cloudflare-admin-events-model.test.ts tests/cloudflare-admin-event-candidates.test.ts tests/admin-event-editor.test.ts
```

Browser command:

```sh
node --test --test-reporter=tap --test-concurrency=1 tests/drl-policy.browser.test.mjs tests/admin-event-create.browser.test.mjs
```

Đã sửa và chạy lại các lỗi phát hiện: fixtures chưa có schema phiên bản/title_search, các approval tests còn gửi payload không chọn rule, picker tự đổi policy khi sửa năm, và chuỗi JSON của harness gây tràn ngang mobile. Không xóa hoặc bỏ qua tests. Các warnings còn lại là Browserslist cũ, chunk build trên 500 kB, và Babel xử lý dependency lớn trong harness; không tự nâng dependency ngoài phạm vi.

## Thay đổi bàn giao

- UI: desktop/mobile dùng cùng phụ lục nguyên văn và cùng picker; đủ 46 tiêu chí/5 mục, 5 điểm trừ, ghi chú và trường hợp đặc thù. Theo yêu cầu chủ dự án, modal chỉ hiển thị phụ lục 2026, đã bỏ bộ chọn “Phiên bản tra cứu”, đoạn giới thiệu nguồn ở đầu và đoạn diễn giải “Điểm cố định…” ở cuối. Dữ liệu giao diện cũ vẫn được lưu trong mã nguồn để đối chiếu. Picker có tìm kiếm, nhóm mục, vai trò/cấp, đơn vị, context, trạng thái tải/lỗi và giữ rule đã lưu. Chi tiết sự kiện hiển thị phiên bản/năm/đơn vị và điều kiện minh chứng ngoài Trường.
- API: kiểm context năm học/policy; với phiên bản 2026, chỉ nhận rule thuộc danh mục nguồn đã kiểm chứng; không nhập điểm tùy ý. Legacy giữ nhãn nguồn chưa xác minh. Draft mới có context và chỉ công khai khi có rule. Đường contribution dùng cùng bộ kiểm; quyền Auth/Staff không đổi.
- DB: chỉ thêm 0058/0059, không sửa 0052; thêm context/indexes/audit và seed idempotent 46 IDs mới, không backfill lịch sử. Importer replacement cũ bị khóa chế độ apply.
- AI: corpus vẫn tìm exact/recurring/similar; policy/corpus/year/rule hash và revision thuật toán cùng tham gia fingerprint. Rule mới chưa có mapping được duyệt thì abstain; observed code không là rule ID. Cache cũ giữ nguyên; retry candidate pending lưu snapshot; candidate đã duyệt giữ nguyên. Điểm trừ/khuyết tật/chức vụ/thành viên không vào event picker.

## Bảo toàn dữ liệu và giới hạn phát hành

Các phép so sánh toàn bộ history/snapshot trên SQLite và D1 local đã PASS. Không có tác vụ ghi production, import lại corpus, xóa cache, sửa trạng thái candidate production hoặc thay đổi rollout. Tuy nhiên chưa đọc/so sánh từng hàng production, vì vậy checkpoint `OLD_DATA_PRESERVED=NOT_VERIFIED` áp dụng cho audit production; không dùng kết quả giả lập để tuyên bố đã kiểm dữ liệu thật.

Trước release cần chủ dự án quyết định các mục trong [đối chiếu nguồn](drl-policy-2026-crosswalk.md) và [kế hoạch release/rollback](drl-policy-2026-release.md): nguồn quy chế cũ; phạm vi “hoạt động khác”; hướng dẫn cộng dồn/khấu trừ/áp trần; năm học của sự kiện qua kỳ; phân loại thành tích/chứng chỉ và duyệt minh chứng; kiểm tra trực quan Word; trình tự schema → code hiểu phiên bản → seed trong cửa sổ bảo trì. Legacy có thể được chọn rõ năm học cũ, nhưng vẫn mang nhãn nguồn chưa xác minh; chủ dự án cần xác nhận căn cứ trước khi cho phép sử dụng nghiệp vụ đó khi release.

Không merge, deploy, ghi D1/R2 production, deploy Auth Worker, push main hoặc thay đổi PR #88. Không commit Word, workbook gốc, dữ liệu cá nhân hay secrets.

## Danh sách file thay đổi

### Database và API

- `cloudflare/migrations/0058_drl_policy_versions.sql`
- `cloudflare/migrations/0059_seed_drl_policy_2026.sql`
- `cloudflare/worker/src/admin-event-mutations.ts`
- `cloudflare/worker/src/admin-events.ts`
- `cloudflare/worker/src/event-candidates.ts`
- `cloudflare/worker/src/event-drl-api.ts`
- `cloudflare/worker/src/event-drl-policy.ts`
- `cloudflare/worker/src/event-drl-prediction.ts`
- `cloudflare/worker/src/events.ts`
- `cloudflare/worker/src/user-submissions.ts`

### Giao diện và dữ liệu dùng chung

- `components/AdminEventCandidates.tsx`
- `components/AdminEventEditorPage.tsx`
- `components/DrlScoreGuide.tsx`
- `components/EventDetailView.tsx`
- `components/EventDrlAssistant.tsx`
- `components/EventsBoard.tsx`
- `components/MobileEvents.tsx`
- `utils/adminEventForm.ts`
- `utils/drlLegacyGuide.ts`
- `utils/drlPolicy.ts`
- `utils/drlPolicy2026.ts`
- `utils/eventDrlApi.ts`

### Scripts và tests

- `package.json`
- `scripts/build-drl-policy-seed.mjs`
- `scripts/import-event-drl-history.mjs`
- `scripts/test-drl-policy-d1-local.mjs`
- `scripts/verify-drl-policy-source.py`
- `tests/admin-event-create.browser.test.mjs`
- `tests/cloudflare-admin-event-candidates.test.ts`
- `tests/cloudflare-admin-events-model.test.ts`
- `tests/drl-policy-harness.html`
- `tests/drl-policy-harness.tsx`
- `tests/drl-policy.browser.test.mjs`
- `tests/event-drl-history.test.ts`
- `tests/event-drl-policy.test.ts`

### Báo cáo

- `docs/drl-policy-2026-audit.md`
- `docs/drl-policy-2026-crosswalk.md`
- `docs/drl-policy-2026-release.md`
- `docs/drl-policy-2026-validation.md`
