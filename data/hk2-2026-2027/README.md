# Lịch giảng dự kiến HK2 2026–2027

Đây là **gói đề xuất để review, chưa công bố**. Không có lớp HK2 nào được ghi lên production bởi thay đổi này. Học kỳ: `HK2_2026_2027`. Không dùng dữ liệu giảng viên HK1 để bổ sung.

## Nguồn và kiểm tra tính toàn vẹn

`source/` giữ nguyên byte của ba tệp trong ZIP người dùng cung cấp và hai Excel gốc tìm thấy trong Downloads. Cả hai Excel gốc khớp SHA-256 đã ghi trong manifest của staging:

| Nguồn | SHA-256 |
| --- | --- |
| `Copy of Gửi SV Ke hoach HK2_2026_2027_V8 (gốc).xlsx` | `e492acb57adc942899491df4bb58c50a45384c086b042af9665c29141012f886` |
| `20261119165803-1042cong-bo-lg-hk2_2026_2027_kiem-tra-trung-lich-ngay-16-11-26.xlsx` | `300c9c86787253929e52b8b36f47ee28f3f782f419f802e4a5eea5388a5aef2e` |

`integrity.json` ghi thêm hash ZIP, staging, review và hướng dẫn lúc nhận. Những hash bổ sung này là dấu vết tiếp nhận, không phải chữ ký/xác thực độc lập của trường. Script xác minh **tất cả hash trước khi parse bất cứ workbook/staging nào**. `.gitattributes` tắt chuyển đổi xuống dòng cho input gốc để SHA-256 không đổi khi checkout trên Windows/Linux. Tài liệu hướng dẫn trong ZIP được giữ như tài liệu nguồn; không thực thi lệnh hoặc coi những khẳng định về production trong tài liệu là bằng chứng hiện hành.

Đã đọc toàn bộ 9 sheet của 3 workbook, gồm mọi dòng/cột, tiêu đề, ghi chú và vùng đã định dạng. `generated/catalogue.json.sheets` ghi số dòng/cột, số ô có dữ liệu và hash giá trị từng sheet. Đã đối chiếu từng trường của 2.357 lớp staging với các dòng gốc, 3 placeholder với dòng gốc, 2.357 dòng review, toàn bộ ngoại lệ, lịch trường và 22 tuần. `TONG QUAN` được đọc đầy đủ; các số liệu được tính lại từ dòng chi tiết, không lấy kết luận từ ô A1 hoặc sheet tổng quan.

Đối chiếu trực tiếp hai Excel gốc đã thực hiện, không chỉ đối chiếu review với staging. Liên kết thông báo trường được giữ trong manifest gốc. Công cụ web không truy cập được trang đó trong phiên này; không tuyên bố đã xác minh thông báo trực tuyến hay có bản cập nhật mới hơn các tệp này.

## Kết quả đối chiếu

| Nhóm | Số lượng |
| --- | ---: |
| Chính quy chuẩn, nguồn | 937 |
| TABP / Đặc biệt / Elite, nguồn | 1.423 |
| Tổng dòng nguồn | 2.360 |
| Placeholder `_262_`, cách ly ngoài staging | 3 |
| Staging, mã duy nhất trong HK2 | 2.357 |
| `CANDIDATE` / `REVIEW_REQUIRED` của gói nguồn | 2.322 / 35 |
| Đủ điều kiện kỹ thuật để đề xuất nhập, chờ owner | 2.349 |
| Chặn công bố vì ca `1-2` hoặc `3-5` chưa có giờ chính xác | 8 |
| Lớp có cờ, gồm 8 lớp chặn | 112 |
| Lớp có cảnh báo nhưng không chặn kỹ thuật | 104 |
| Dòng sheet ngoại lệ, gồm 3 placeholder | 115 |

Có **113 lượt cờ trên 112 lớp**. `FIN726_262_L14` có đồng thời cờ phòng thi điều chỉnh và thi phần mềm sau 18/07, nên workbook ghi hai cờ trên cùng một dòng. Không nhầm số lượt cờ với số dòng ngoại lệ. `REVIEW_REQUIRED` không đồng nghĩa phải loại khỏi import: 27 trong 35 lớp đó đủ điều kiện kỹ thuật, 8 lớp còn lại thiếu giờ học. Tất cả 2.349 lớp vẫn phải chờ owner cho phép công bố dữ liệu dự kiến.

Chương trình đích: chuẩn `NULL` (937), `Tiếng Anh bán phần` (1.328), `Chương trình đặc biệt` (63), `CT Elite` (29). Đã đối chiếu đúng tên danh mục HK1 production, không đổi tên chương trình cũ.

109 lớp chuẩn chưa có phòng và lịch thi: giữ `NULL` theo nguồn, không loại cả lớp, không tạo phòng/ngày thi. Tổng 233 `exam_date = NULL` gồm 109 lịch thi chưa công bố và 124 lớp tiểu luận.

## Ánh xạ schema và provenance

| Nhóm trường D1 | Cách xử lý |
| --- | --- |
| `course_code`, `subject_name`, `prerequisite`, `credits`, `knowledge_block` | Đối chiếu toàn bộ giá trị nguồn; mã `_GHÉP` giữ nguyên dấu và hậu tố; không gộp/tách lớp |
| `cohort`, `major`, `group_name`, `phase`, `orientation`, `orientation_note_3`, `registration_type` | Giữ nội dung các cột tương ứng; giữ nhóm nhiều giá trị và đợt |
| `day_of_week`, `shift`, `weeks`, `room`, `campus` | Ghép theo từng dòng buổi học; chỉ broadcast giá trị singleton, từ chối các mảng nhiều dòng khác độ dài; không tạo tích chéo |
| `shift` | `S→07:00-11:05`, `C→13:00-17:05`, `1-3→07:00-09:15`, `4-5→09:35-11:05`, `6-8→13:00-15:15`, `9-10→15:35-17:05`; đã đối chiếu ghi chú giờ ở cả hai Excel và code export hiện tại |
| Ca chưa xác định | Giữ `raw_schedule` và từng `segments.shift_raw`; `course.shift=NULL`; chặn toàn bộ 8 lớp có bất kỳ đoạn `1-2`/`3-5`, không suy luận giờ đoạn còn thiếu |
| `campus`, `exam_campus` | Mã hiện có: `TĐ→TD`, `39HN - SG` / `36 TTĐ-SG→Q1`; địa điểm gốc còn trong `raw_schedule` và Excel gốc; phòng có dấu cách giữ nguyên |
| `exam_date`, `exam_shift`, `exam_campus`, `exam_room` | Chuẩn hóa ngày `DD/MM/YYYY`, giữ ca/cơ sở theo nguồn; không đổi ngày 19–21/07; ký hiệu `ĐC…` giữ trong ghi chú/provenance và không dùng như tên phòng |
| Tiểu luận | `assessment=essay`, `exam_date=exam_shift=NULL`, ghi rõ hình thức đánh giá trong `general_note`; không tạo ngày thi |
| `instructor` | Luôn `NULL`, `instructor_search=''` khi nhập sau này; không sao chép từ HK1 |
| `academic_program` | Chuẩn `NULL`; ba tên khác dùng đúng danh mục HK1 |
| `semester`, `is_user_added` | Luôn `HK2_2026_2027`, `false`; không tạo lịch cá nhân, yêu cầu thêm lớp hay dữ liệu người dùng |
| `general_note` | Giữ các ghi chú có nhãn nguồn, marker phòng thi và đánh giá tiểu luận; không suy diễn phần thiếu |

Mỗi record trong `generated/catalogue.json` có `source_file`, `source_kind`, `source_row`, `source_order`, `raw_schedule`, `source_notes`, `source_program`, `assumptions`, `issues`, `status`, `publication`, `assessment` và `segments`. Hash nguồn ở `integrity.json`. Đây là cấu trúc chuẩn bị, **không phải migration tự động**. `source_kind` ở provenance dùng `standard/advanced`; khi nhập vào D1 sau này phải dùng enum authority hiện có (ví dụ thao tác admin được duyệt), không đưa hai giá trị provenance này vào cột enum D1.

`course_schedules` dùng khóa tự nhiên theo học kỳ + mã tìm kiếm được chuẩn hóa như course authority (`vi-VN` lowercase, gộp khoảng trắng). Chỉ mục tự nhiên hiện tại **không unique**. Đã phát hiện HK1 có ba nhóm trùng mã trong dữ liệu có sẵn; không thêm unique index toàn bảng và không sửa/xóa các lớp đó. Phương án nhập phải kiểm tra đầy đủ các lớp HK2, gồm cả retired, và dừng nếu có trùng/xung đột. `planImport()` chỉ báo no-op cho lớp đích đã published và mọi trường nội dung khớp; mọi khác biệt/retired/lớp HK2 ngoài gói đều chặn. HK1 không tham gia so khớp hoặc cập nhật.

API công khai chỉ đọc `catalogue_visibility='published'`; không có trạng thái staging trong enum hiện hành. Vì vậy dữ liệu staging ở repo, không đưa vào bảng production bằng giá trị visibility tự đặt. Không thay course authority, scraper, release guard hay workflow. API admin hiện có hỗ trợ từng lớp, CAS và receipt, chưa cung cấp thao tác bulk nguyên tử; PR này không thêm endpoint ghi hoặc bỏ qua authority.

## Timeline và ngoại lệ để owner xem xét

- Cả hai khung thời gian khớp đủ 22/22 tuần × 7 ngày: tuần 1 là 15–21/02/2027, tuần 22 là 12–18/07/2027, hè bắt đầu 19/07/2027. `utils/academicCalendar.ts` đã đúng và được giữ nguyên.
- Nghỉ theo ngày 16–18/04 và 30/04–03/05, không gắn `holidayWeeks` cả tuần. Chỉ các chương trình advanced có nghỉ/hội nghị 09–11/07. Không có buổi học nguồn trùng các ngày này.
- Chỉ advanced ghi học trực tuyến 15–20/02; không áp dụng cho chuẩn, không suy luận ngày 21/02 là online. Các phạm vi này lưu trong `calendar_evidence` và được kiểm thử ranh giới theo từng ngày.
- Giữ 78 lịch thi phần mềm 19–21/07 đúng khung hè ở sheet advanced. Đây là cảnh báo cần theo dõi khi học kỳ hè bắt đầu, không phải lý do tự đổi ngày hoặc loại lớp.
- 4 lớp chuẩn thi Chủ nhật 25/04: ngày được giữ nguyên nhưng cần trường/owner xác nhận vì khung chuẩn không ghi thi ngày đó. Advanced có ghi `THI PM` ngày 25/04; không áp quy tắc này sang chuẩn.
- 8 mã `_GHÉP` giữ nguyên và cần review ý nghĩa ghép; không tự hợp nhất lớp theo tên môn.
- 15 ô phòng thi là marker (`ĐCGĐ`, `ĐCGĐ2`, `ĐC LG,LTHI`, `ĐC LG`), không phải phòng thi. Giữ nguồn trong ghi chú; chờ trường công bố phòng thật.
- 8 lớp chặn và 3 placeholder chỉ có thể được đưa vào một gói cập nhật mới sau khi trường công bố giờ/mã hợp lệ. Không có tùy chọn CLI để bỏ qua chặn.
- Hai Excel ghi dự kiến; tiêu đề chuẩn lặp khóa 41 nhưng dòng thực tế có 40/41/42; tiêu đề advanced có năm 2027 khác thời điểm tên tệp. Giữ nguyên caveat của nguồn.

Danh sách mã và tọa độ Excel đầy đủ: `generated/exceptions.json`. Một số record có cảnh báo mang trạng thái nguồn `CANDIDATE`; các cờ vẫn được giữ, không ẩn chỉ vì trạng thái đó.

Các lớp chặn thuộc sheet `LG_40_41_42` của Excel chuẩn:

| Mã lớp | Dòng Excel | Ca nguồn chưa đủ giờ |
| --- | ---: | --- |
| `GYM302_262_PI_D17` | 195 | `4-5` / `3-5` |
| `GYM302_262_PI_D18` | 196 | `4-5` / `3-5` |
| `GYM304_262_PI_D52` | 268 | `4-5` / `3-5` |
| `GYM304_262_PI_D53` | 269 | `4-5` / `3-5` |
| `GYM304_262_QV_D27` | 270 | `1-3` / `1-2` |
| `GYM304_262_QV_D28` | 271 | `1-3` / `1-2` |
| `GYM304_262_QV_D54` | 272 | `1-3` / `1-2` |
| `GYM304_262_QV_D55` | 273 | `1-3` / `1-2` |

4 lớp chuẩn thi 25/04 cần xác nhận: `SOC301_262_D01` (dòng 97), `SOC301_262_D02` (98), `BAF310_262_D01` (611), `BAF310_262_D02` (612). Placeholder advanced nằm ở dòng 1214, 1320, 1321; giữ nguyên toàn bộ trường nguồn trong danh sách cách ly.

## Dry-run và đối chiếu hiện hành

```powershell
npm run courses:hk2:dry-run
node scripts/prepare-hk2-course-import.mjs --check
node scripts/prepare-hk2-course-import.mjs --snapshot=path/to/fresh-readonly-snapshot.json
npm run test:hk2-import
```

Chỉ hỗ trợ `--check` và `--snapshot=…`. `--apply`, `--remote` và cờ khác đều bị từ chối. Script không có network, token hay hàm ghi D1; chỉ viết artifact trong repo khi không dùng `--check`. `--check` xác nhận artifact đã commit khớp kết quả tính lại. Chạy lặp cho cùng đầu vào/snapshot có kết quả giống hệt; không đưa thời gian hiện tại vào artifact.

`production-readonly.json` lưu câu SELECT thực tế, thời gian UTC, ID database, schema, số đếm, danh mục chương trình, mã trùng và toàn bộ kết quả HK2 (rỗng), kèm metadata Cloudflare `rows_written=0` / `changed_db=false` cho mỗi truy vấn. `preflight.sql` là mẫu SELECT để đọc lại bằng công cụ đã được xác thực. Script từ chối snapshot sai phạm vi SQL, thiếu kết quả/schema, có dấu hiệu ghi, hoặc số dòng HK2 không khớp counts (bao gồm retired). Snapshot này là bằng chứng lịch sử, không phải quyền ghi và phải đọc lại trước bước công bố.

Kết quả lúc **19/11/2026 22:16 giờ Việt Nam**: HK1 2.103 published, HK2 0, hè 2025–2026 có 2 published; không có thay đổi dữ liệu. Wrangler CLI cục bộ đã hết phiên đăng nhập; kiểm tra production được thực hiện thành công bằng connector Cloudflare với truy vấn SELECT, không thay secret hoặc đăng nhập lại.

`generated/dry-run.json`: thêm dự kiến 2.349, identical 0, chặn 8, xung đột 0; `can_apply=false`, chờ owner. Có danh sách toàn bộ mã bổ sung, hash payload, hash/thời điểm snapshot và danh sách xung đột. Không cộng 3 placeholder vào số lớp staging.

## Bước công bố cần owner phê duyệt sau review

1. Review PR, SHA commit, hash nguồn/payload và bảng ngoại lệ. Xác nhận được phép công bố dữ liệu dự kiến, giảng viên chưa công bố. Chọn rõ phạm vi 2.349 mã đủ điều kiện và quyết định đối với từng nhóm cảnh báo (đặc biệt 4 ngày thi Chủ nhật, 8 mã ghép, 15 marker và 78 lịch thi hè). Nếu owner giữ lại thêm lớp, tạo gói/số lượng/hash mới và chạy lại tests trước khi duyệt.
2. Phê duyệt **kế hoạch nhập additive theo hash/phạm vi cụ thể**. 8 lớp thiếu giờ và 3 placeholder vẫn ngoài phạm vi; không được approve bằng cách bỏ qua validation. Dữ liệu bổ sung từ trường cần provenance/hash và review mới.
3. Trước thao tác ghi thật, operator phải lấy snapshot SELECT mới bao gồm mọi lớp HK2 (kể cả retired), schema/index/trigger, counts, max source position và hash toàn bộ HK1; chạy lại dry-run với snapshot mới. Dừng nếu thiếu kết quả, có trùng HK2 hoặc nội dung/visibility khác. Xác minh backup/Time Travel và thử phục hồi trên môi trường riêng.
4. Chưa có writer bulk production trong PR này. Owner cần duyệt riêng implementation/operator procedure có transaction/batch nguyên tử, kiểm tra khóa tự nhiên **trong cùng transaction** để tránh race với admin/scraper, receipt/hash/source key/provenance, vị trí tăng sau `MAX(source_position)`, và postcondition đầy đủ. Kiểm thử lại trên local D1 rồi review chính xác artifact/lệnh sẽ ghi trước khi cấp quyền. Không biến test-only fixture writer thành lệnh production.
5. Writer được duyệt chỉ INSERT các mã HK2 còn thiếu; replay khớp hoàn toàn là no-op. Không `DELETE`, `REPLACE`, upsert ghi đè, sửa HK1, user schedules hoặc teacher fallback. D1 không có unique natural key toàn bảng nên preflight bên ngoài transaction một mình không đủ. Bất kỳ lỗi nào phải rollback batch; nếu dùng nhiều batch, cần journal, resume và rollback theo receipt/provenance đã được kiểm thử, không rollback toàn bảng.
6. Sau nhập được duyệt: kiểm tra đúng delta, 0 mã trùng HK2, mọi instructor NULL, đủ trường/multiline, facets và API HK2, hash HK1 và bảng người dùng không đổi; chạy lại để chứng minh 0 additions. Phần sửa tách tên phòng cần được phát hành qua quy trình release hiện hữu trước/cùng đợt công bố để 13 lớp có tên phòng một dòng chứa dấu cách hiển thị đúng. Merge/deploy cần phê duyệt riêng. **Không chạy `scripts/seed-course-schedules-d1.mjs` trên production** vì script đó xóa toàn bảng.

Phiên công việc này dừng ở PR sẵn sàng review. Không merge, deploy, ghi production hoặc thay release guard. Quyền duyệt PR không tự đồng nghĩa quyền công bố dữ liệu HK2.
