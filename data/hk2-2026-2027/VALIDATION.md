# Bằng chứng kiểm tra và phạm vi thay đổi

Ngày kiểm tra: 19/11/2026, giờ Việt Nam. Base: `bdfb86567497948a371d4ac44cc9952068bc1431` (`origin/main` mới nhất khi tạo nhánh và khi kiểm tra lại). Nhánh: `codex/hk2-2026-2027-staged-import`.

## Các lệnh kiểm tra

| Lệnh / kiểm tra | Kết quả |
| --- | --- |
| `npm run test:hk2-import` | PASS, 13 tests, không skip; chạy helper thực tế của cả ScheduleBoard và MobileSchedule |
| `node --test --experimental-strip-types tests/cloudflare-course-authority-foundation.test.ts tests/cloudflare-course-authority-integration.test.mjs tests/cloudflare-course-schedule-sessions.test.ts tests/course-browser-d1-wiring.test.mjs tests/calendar-export.test.ts tests/calendar-export-ui.test.ts tests/schedule-board-model.test.ts` | PASS, 40 tests, không skip |
| `npm test` | Lượt nền tại `e267885`: PASS, exit 0; 1.353 tests, 0 fail / 0 skip. Kết quả full suite của bản bổ sung mobile được ghi trong mô tả và Checks của PR #159 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run cf:typecheck` | PASS, exit 0 |
| `npm run build` | PASS, exit 0; có cảnh báo bundle trên 500 kB, không thay phạm vi để tối ưu bundle |
| `node scripts/prepare-hk2-course-import.mjs --check` | PASS, artifact khớp tính lại từ Excel/staging |
| Hai lần chạy preparation liên tiếp | PASS, stdout và byte của cả 3 artifact giống hệt |
| SHA-256 cả 5 input trong Git index | PASS, không bị chuyển đổi xuống dòng khi `git add` |
| `git diff --check` / `git diff --cached --check` | PASS |

Các log cục bộ ở `.cache/hk2-*.log`, không commit file log sinh tự động. CI của PR chạy lại full suite qua `npm test`; không thêm/bỏ qua workflow hoặc guard bảo vệ. [Checks của PR #159](https://github.com/tqhoangg08/HUB-PLANNER/pull/159/checks) là bằng chứng CI cho commit head hiện hành; kết quả full suite cục bộ và SHA bản bổ sung được ghi vào mô tả PR sau khi kiểm tra xong.

Lượt full suite đầu dừng tại test so sánh nguyên văn `0058_seed_drl_catalog_2026.sql` vì checkout Windows `core.autocrlf=true` tạo CRLF. Đã xác minh nội dung sau chuẩn hóa xuống dòng khớp chính xác blob `origin/main`, rồi tạm đưa working copy của tệp đó về LF để kiểm tra. `npm run test:event-drl` kiểm tra lại đạt 13/13; sau đó chạy lại **toàn bộ** `npm test` đạt kết quả PASS nêu trên. Sau kiểm thử đã khôi phục CRLF của working copy ban đầu; không có diff/commit migration DRL. Không bỏ qua hoặc sửa test để qua. Trên Windows, test DRL nguyên văn này cần working copy LF như blob Git/checkout Linux của CI.

## Đối chiếu đầy đủ và dữ liệu chuẩn bị

- 9 sheet được đọc toàn bộ; 2.360 dòng gốc được đối chiếu theo tọa độ nguồn. 937 chuẩn + 1.423 advanced − 3 placeholder = 2.357 staging; 2.322 CANDIDATE + 35 REVIEW_REQUIRED.
- 2.349 mã đủ điều kiện kỹ thuật; 8 mã chặn vì giờ chưa biết; 3 placeholder cách ly ngoài staging. 112 lớp có 113 lượt cờ, 104 lớp cảnh báo không bị tự loại. Tất cả vẫn chờ owner cho phép công bố.
- 2.357 instructor NULL; 8 mã `_GHÉP` nguyên vẹn; 124 tiểu luận không ngày/ca thi giả; 15 marker không trở thành phòng; 78 lịch thi hè giữ nguyên và đều có ghi chú nguồn `PM`.
- 22 tuần × 7 ngày đối chiếu độc lập trong từng Excel và với code calendar. 0 buổi học và 0 lịch thi trùng ngày nghỉ theo phạm vi chương trình; không thêm holidayWeeks. Các hoạt động/online riêng advanced giữ đúng phạm vi.
- 3.144 đoạn buổi học của 2.349 lớp đủ điều kiện, gồm 782 lớp nhiều đoạn, khớp với parser frontend hiện hữu. Test lấy AST và chạy chính các helper slot, phân loại ca và tách trường của **từng** `ScheduleBoard.tsx` và `MobileSchedule.tsx`, cùng parser tuần production; không dùng classifier ca giả lập. Kiểm tra mọi tuần của các buổi học, đủ thứ/tuần/giờ/phòng và không mutate course.
- Test ban đầu mới chạy ScheduleBoard dù tên nói desktop/mobile. Bản bổ sung đã tái hiện lỗi riêng MobileSchedule trước sửa: `MLM308_262_D05_GHÉP` trả `LỚP` thay vì `LỚP ẢO`, và mẫu HK1 `GYM303_261_BB_D01` trả `Nhà` thay vì `Nhà tập luyện Bóng bàn`. MobileSchedule được sửa đúng một dòng để giống ScheduleBoard: chỉ tách phòng theo newline, giữ nguyên khoảng trắng trong tên. 13 lớp HK2 đủ điều kiện có tên phòng một dòng chứa dấu cách. Không đổi dashboard, typography, spacing, bảng hoặc layout.
- Cả hai component được chạy với ba mẫu trường lịch từ export HK1 cũ (`ACC306_261_L02`, `GYM303_261_BB_D01`, `MLM303_261_L16`), không copy giảng viên/ID/trường cá nhân. Kiểm tra thêm phòng undefined/null/rỗng/whitespace, `LỚP ẢO`/`Sân bóng đá`/`Nhà thi đấu`, khoảng trắng nội bộ, thứ/ca/tuần legacy phân cách bằng dấu cách, CRLF, phòng trống ở đầu/cuối mảng nhiều buổi, nhiều ca cùng ngày, tuần tổng quan 0, thứ phân cách dấu phẩy và các slot không khớp. Thứ tự phòng nhiều dòng được giữ; đối tượng HK1 đầu vào không bị sửa.

## Replay, rollback và giới hạn kiểm thử

Fixture SQLite cục bộ dùng nguyên schema/index/trigger lấy bằng SELECT từ D1 thực tế. Khởi tạo 2.103 lớp HK1 **giả lập riêng cho test**, rồi thử 2.349 lớp HK2 đầy đủ. Lỗi unique ở cuối transaction rollback toàn bộ phần thêm và facets; snapshot HK1 trước/sau giống hệt. Lần nhập thành công thêm đúng 2.349; planner chạy lại cho additions 0 / identical 2.349 / blocked 8 / conflicts 0. Facets HK2 tổng 2.349; facets HK1 và bốn bảng user/request/receipt/outbox giữ nguyên. API đọc thật của Worker trên fixture trả đúng tổng và NULL instructor, filter Elite trả 29.

D1 runtime cục bộ (Miniflare) kiểm thử 6 lớp đại diện: thường, nhiều buổi, tiểu luận, marker, thi hè, mã ghép. Dùng nguyên schema/index/trigger; lỗi unique ở cuối batch rollback cả courses/facets; batch thành công và API đọc đúng 6, mọi instructor NULL. Không coi đây là bằng chứng hiệu năng/giới hạn của một batch D1 2.349 lớp. Khối lượng đầy đủ được kiểm tra trên fixture SQLite; writer production sau này phải được review/đo kích thước batch và rollback riêng. Không dùng test-only writer làm lệnh production.

Tests còn xác nhận hash sai/thiếu tệp dừng trước parse; snapshot thiếu/sai phạm vi SQL/sai số đếm/có ghi bị từ chối; mã trùng, lớp HK2 ngoài gói, retired hay nội dung khác dừng; missing credits/instructor tự điền/sai semester bị chặn; CLI từ chối `--apply --remote`.

Production chỉ được SELECT: `production-readonly.json` ghi metadata 0 rows_written / changed_db=false cho cả 5 truy vấn. 2.103 lớp HK1 published, HK2 rỗng; không sửa dữ liệu thật. Snapshot là bằng chứng theo thời điểm, không thay thế lần đọc lại/backup trước công bố.

## Hash artifact có thể tái tạo

| Artifact | SHA-256 |
| --- | --- |
| `generated/catalogue.json` | `abdac7246789a2a28e414ce79d789ebe3e854ca4f4eedac68a4c935ed1344eb2` |
| `generated/dry-run.json` | `3737ef241081f5811ba9cad277fb72d58a866fc64370ca5fd74189b7b5e2adcd` |
| `generated/exceptions.json` | `eb472ae12b106ee1fcc221a12dd2a10bf3312fbe8bcea66829fa095ca088d6ab` |
| Payload nội dung 2.349 lớp cần thêm | `6f941e6d5504763facdd737863de0863374758039fa832d8ef8a2e74e6387415` |

## Danh sách đầy đủ 20 tệp thay đổi

```text
.gitattributes
components/ScheduleBoard.tsx
components/MobileSchedule.tsx
package.json
scripts/hk2-2026-2027/catalogue.mjs
scripts/prepare-hk2-course-import.mjs
tests/hk2-course-import.test.mjs
data/hk2-2026-2027/README.md
data/hk2-2026-2027/VALIDATION.md
data/hk2-2026-2027/integrity.json
data/hk2-2026-2027/preflight.sql
data/hk2-2026-2027/production-readonly.json
data/hk2-2026-2027/generated/catalogue.json
data/hk2-2026-2027/generated/dry-run.json
data/hk2-2026-2027/generated/exceptions.json
data/hk2-2026-2027/source/20261119165803-1042cong-bo-lg-hk2_2026_2027_kiem-tra-trung-lich-ngay-16-11-26.xlsx
data/hk2-2026-2027/source/Copy of Gửi SV Ke hoach HK2_2026_2027_V8 (gốc).xlsx
data/hk2-2026-2027/source/hub_planner_hk2_2026_2027_codex_instructions.md
data/hk2-2026-2027/source/hub_planner_hk2_2026_2027_review.xlsx
data/hk2-2026-2027/source/hub_planner_hk2_2026_2027_staging.json
```

Chưa giải quyết: giờ chính xác 8 lớp, mã hợp lệ 3 placeholder, xác nhận owner/trường đối với các nhóm cảnh báo và quyền công bố dữ liệu dự kiến; chưa có writer bulk production được duyệt. Hướng dẫn và bước owner cần phê duyệt nằm trong `README.md`. Không merge, deploy hoặc ghi production trong phạm vi PR này.
