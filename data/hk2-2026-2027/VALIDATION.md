# Bằng chứng kiểm tra — quyết định owner ngày 20/11/2026

PR #159, branch `codex/hk2-2026-2027-staged-import`, tiếp tục từ `45ba1341a6e608134b77059dd63e9ecc0f108881`. Không tạo PR mới. Quyết định mới mở chặn 8 lớp GDTC bằng ca S dự kiến và giữ 3 placeholder làm mục học phần tạm riêng; không cấp quyền công bố hoặc ghi production.

## Kết quả dữ liệu và ranh giới

| Chỉ tiêu | Giá trị |
| --- | ---: |
| Dòng nguồn / dòng giữ trong dữ liệu chuẩn bị | 2.360 / 2.360 |
| Lớp có mã trường / đủ điều kiện kỹ thuật | 2.357 / 2.357 |
| GDTC phân loại S theo owner, chưa có giờ chính xác | 8 |
| Mục tạm riêng, chưa được import như lớp official | 3 |
| Blocked theo quy tắc tiết cũ / instructor NULL | 0 / 2.360 |
| Cờ nguồn: lớp / lượt cờ / dòng sheet ngoại lệ | 112 / 113 / 115 |

Năm tệp đã nhận trong `source/` được so sánh byte với commit trước và hash integrity, không sửa. Original staging vẫn 2.357 lớp + 3 exceptions, trạng thái nguồn 2.322/35. Audit đối chiếu toàn bộ 9 sheet và 2.360 dòng trước khi derive. 2.349 lớp còn lại giữ nguyên tất cả trường nội dung; 8 lớp owner chỉ đổi shift/general_note dẫn xuất, giữ mã và thứ/tuần/phòng/cơ sở, các đoạn có giờ đúng vẫn giữ giờ đúng. Các cờ khác, HK1 và calendar không đổi.

`generated/manifest.json` chứa hash hiện hành của catalogue, dry-run, exceptions, temporary-items, owner-decisions, input nguồn và builder/runtime policy. Không thay hash nguồn để khớp quyết định owner. Hai lần chạy preparation cho cùng đầu vào/snapshot phải cho cùng byte; `--check` tính lại đầy đủ từ nguồn để xác nhận artifact được commit.

## Kiểm tra hiện hành

| Kiểm tra | Bằng chứng |
| --- | --- |
| `npm run test:hk2-import` | 17 regression tests, 0 fail / 0 skip |
| Calendar export/UI, import conflicts, Worker sessions, course notification push, schedule board model | 33 targeted tests, 0 fail / 0 skip |
| `npm run typecheck` / `npm run cf:typecheck` | PASS, không thay authority hoặc whitelist ghi |
| `npm run build` | PASS; cảnh báo chunk size có sẵn, không mở rộng phạm vi để tối ưu bundle |
| `git diff --check` và diff của commit | Kiểm tra trước commit/push |
| Full `npm test` và CI trên commit owner hiện hành | Kết quả cuối và SHA được ghi trong mô tả PR #159; [Checks](https://github.com/tqhoangg08/HUB-PLANNER/pull/159/checks) kiểm chứng đúng head |

Full suite cục bộ và CI được theo dõi đến hoàn tất trước báo cáo cuối. Các log cục bộ `.cache/hk2-owner-*.log` không commit. Các lượt nền đã qua: commit ban đầu 1.353 tests; lượt mobile `45ba134` 1.356 tests và CI xanh. Những số đó là lịch sử, không thay thế lượt kiểm tra owner mới.

Trên Windows `core.autocrlf=true`, test DRL nguyên văn yêu cầu migration `0058_seed_drl_catalog_2026.sql` có LF như blob Git. Đã xác minh nội dung không khác HEAD rồi chỉ tạm đổi working copy về LF khi chạy full suite, sau đó khôi phục byte ban đầu. Không commit migration DRL, sửa/bỏ qua test, tăng timeout workflow hay thay guard.

## Regression về độ chính xác và ca S dự kiến

- Kiểm tra đúng cả 8 mã owner chỉ định, không mở rộng sang mã GDTC khác. Nguồn và các trường không đổi được đối chiếu với staging bất biến.
- Mọi đoạn `1-2`/`3-5` có ca S, tiết gốc, `timing_precision=owner_half_day`, giờ bắt đầu/kết thúc NULL và quyết định owner; không dựng 07:00–11:05. Các đoạn 1-3/4-5 vẫn có giờ nguồn chính xác.
- Nhãn portable `S (dự kiến theo owner, tiết …)` đi qua snapshot lịch cá nhân và serialize round-trip mà không mất độ chính xác. Planner chặn việc bỏ nhãn thành S trơn hoặc bỏ provenance quyết định owner.
- Chạy AST/helper thật của **cả ScheduleBoard và MobileSchedule** cùng parser tuần và phân loại ca thực tế: đúng tất cả slot HK2 theo mọi tuần; nhãn ca có “dự kiến theo owner/giờ chưa công bố”, không có clock giả. Tên phòng có dấu cách, nhiều dòng, dòng trống, CRLF, các ca S/C, nhiều ca cùng ngày và các mẫu HK1 cũ vẫn đúng; đối tượng course không mutate.
- Session chưa biết giờ có exact range NULL, kiểm tra trùng bảo thủ trong cùng ngày/tuần/ca. Không đổi thành buổi tự khai với giờ mặc định. HK1 và các giờ hợp lệ khác dùng logic cũ.
- ICS chỉ xuất đoạn đã có giờ, báo unknown_shift và bỏ đoạn dự kiến. Test một đoạn dự kiến độc lập với reminder=15 không tạo DTSTART, DTEND hoặc VALARM. Không tạo thông báo có giờ chính xác giả. Push quyết định yêu cầu lớp hiện hành không chứa giờ học; nhóm tests notification hiện có vẫn qua.

## Regression ba mục tạm

- Đúng dòng 1214/1320/1321, ba technical key ổn định theo source SHA + sheet + row; hai dòng thực tập giống tên vẫn là hai mục. Official code NULL; `_262_` chỉ ở provenance; credits lần lượt 1/NULL/NULL; instructor NULL.
- Raw thứ 6/tuần 1–22/S-C chỉ ở provenance. Preview không có lịch hoạt động, segments rỗng và không có năng lực chọn/add lịch/ICS/xung đột.
- Search preview “Thực tập giữa khóa” trả hai mục; tìm dòng 1320 trả đúng technical key; `_262_` không thành gợi ý mã official.
- Parser lịch, helper slot desktop/mobile và ICS từ chối kind tạm ngay cả khi test cố ý chuyển kèm raw weekly fields. Không có lịch tuần, VEVENT hoặc alarm giả.
- Planner official từ chối temporary_subject và technical key trùng. Không tạo mã giả hay đưa ba row vào course_schedules. Schema hiện tại chưa hỗ trợ an toàn nên phương án API/schema/publication nằm riêng ở `TEMPORARY_ITEMS.md`, cần owner phê duyệt thêm.

## Rollback, idempotency và dữ liệu HK1

Fixture SQLite dùng schema/index/trigger đọc từ D1 thực tế. Khởi tạo 2.103 lớp HK1 **giả lập trong test** và import đủ 2.357 lớp HK2. Lỗi unique cuối transaction rollback toàn bộ courses/facets; HK1 trước/sau giống hệt. Thành công thêm 2.357; planner chạy lại additions=0 / identical=2.357 / blocked=0, vẫn giữ 3 mục tạm ngoài official import. Facets official đúng 2.357; bảng user/request/receipt/outbox không đổi. API Worker đọc đúng 2.357 official, Elite 29; không chứa `_262_` hoặc technical key giả.

D1 Miniflare cục bộ kiểm tra 7 lớp đại diện, gồm lớp ca S dự kiến, và rollback nguyên tử của batch lỗi. API giữ nguyên nhãn/provenance thời gian và NULL instructor. Không coi 7 mẫu này là benchmark D1 batch 2.357 dòng; khối lượng đầy đủ được kiểm tra trên SQLite fixture. Writer/batch size/rollback production vẫn cần review riêng.

Production trong PR chỉ có snapshot lịch sử SELECT ngày 19/11; không ghi production và không thử production để kiểm tra rollback. Không thay course authority, release guard, các schema/index bảo vệ, HK1 hoặc dữ liệu người dùng.

## Danh sách đầy đủ 28 tệp của PR

```text
.gitattributes
components/ScheduleBoard.tsx
components/MobileSchedule.tsx
package.json
scripts/hk2-2026-2027/catalogue.mjs
scripts/prepare-hk2-course-import.mjs
tests/hk2-course-import.test.mjs
utils/calendarExport.ts
utils/scheduleLogic.js
utils/scheduleSessions.ts
utils/provisionalCoursePolicy.js
data/hk2-2026-2027/README.md
data/hk2-2026-2027/VALIDATION.md
data/hk2-2026-2027/TEMPORARY_ITEMS.md
data/hk2-2026-2027/integrity.json
data/hk2-2026-2027/preflight.sql
data/hk2-2026-2027/production-readonly.json
data/hk2-2026-2027/generated/catalogue.json
data/hk2-2026-2027/generated/dry-run.json
data/hk2-2026-2027/generated/exceptions.json
data/hk2-2026-2027/generated/manifest.json
data/hk2-2026-2027/generated/owner-decisions.json
data/hk2-2026-2027/generated/temporary-items.json
data/hk2-2026-2027/source/20261119165803-1042cong-bo-lg-hk2_2026_2027_kiem-tra-trung-lich-ngay-16-11-26.xlsx
data/hk2-2026-2027/source/Copy of Gửi SV Ke hoach HK2_2026_2027_V8 (gốc).xlsx
data/hk2-2026-2027/source/hub_planner_hk2_2026_2027_codex_instructions.md
data/hk2-2026-2027/source/hub_planner_hk2_2026_2027_review.xlsx
data/hk2-2026-2027/source/hub_planner_hk2_2026_2027_staging.json
```

Phê duyệt còn cần: công bố 2.357 lớp dự kiến với các cảnh báo còn lại và cơ chế bỏ giờ chưa xác minh; snapshot/backup/writer bulk/release chính xác; phương án schema/API/UI riêng nếu muốn công bố ba mục tạm trong ứng dụng. Không merge, deploy hoặc ghi production trong lượt này.
