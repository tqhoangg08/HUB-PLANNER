# Lịch giảng dự kiến HK2 2026–2027 — phương án owner ngày 20/11/2026

Gói chuẩn bị của PR #159 gồm **2.360 dòng: 2.357 lớp có mã trường + 3 mục học phần tạm**. Tất cả giảng viên NULL. Quyết định mới của owner mở chặn 8 lớp GDTC bằng phân loại ca S dự kiến, nhưng không xác nhận giờ chính xác và không cấp quyền ghi/công bố production.

## Nguồn bất biến và dữ liệu dẫn xuất

`source/` giữ nguyên byte của staging JSON, review XLSX, tài liệu hướng dẫn nhận trong ZIP và hai Excel gốc. `integrity.json` giữ nguyên hash tiếp nhận. Hai Excel gốc đã được đối chiếu toàn bộ và khớp SHA-256 của manifest nguồn:

| Excel gốc | SHA-256 |
| --- | --- |
| `Copy of Gửi SV Ke hoach HK2_2026_2027_V8 (gốc).xlsx` | `e492acb57adc942899491df4bb58c50a45384c086b042af9665c29141012f886` |
| `20261119165803-1042cong-bo-lg-hk2_2026_2027_kiem-tra-trung-lich-ngay-16-11-26.xlsx` | `300c9c86787253929e52b8b36f47ee28f3f782f419f802e4a5eea5388a5aef2e` |

Script xác minh toàn bộ hash trước parse, đọc đủ 9 sheet, 2.360 dòng gốc, 2.357 dòng review, 115 dòng ngoại lệ và 22 tuần. Từng trường staging được đối chiếu với nguồn **trước khi** áp dụng quyết định owner. Không sửa staging nguồn để hợp thức hóa quyết định mới. Tài liệu hướng dẫn đính kèm là tài liệu nguồn, không phải quyền thực thi lệnh hoặc bằng chứng production hiện hành.

`generated/catalogue.json` là artifact dẫn xuất phiên bản 2: `records` có 2.357 lớp, `temporary_items` có 3 mục. `owner-decisions.json` ghi rõ quyết định mới, 8 mã/3 dòng được phép xử lý, nguồn quyết định là owner và `exact_times_published_by_school=false`. `manifest.json` pin hash của năm artifact còn lại, hash nguồn và hash builder/runtime policy. `.gitattributes` bảo toàn byte input và xuống dòng của các tệp được pin.

## Số lượng và trạng thái

| Chỉ tiêu | Số lượng |
| --- | ---: |
| Chuẩn / advanced trong Excel | 937 / 1.423 |
| Tổng nguồn và tổng dòng được giữ trong dữ liệu chuẩn bị | 2.360 |
| Có mã lớp duy nhất từ trường / đủ điều kiện kỹ thuật để đề xuất nhập chính thức | 2.357 |
| Trong đó GDTC mở chặn bằng ca S dự kiến theo owner | 8 |
| Lớp chính thức còn bị chặn vì quy tắc tiết cũ | 0 |
| Mục tạm, chưa đủ điều kiện công bố như lớp chính thức | 3 |
| Giảng viên NULL, gồm cả mục tạm | 2.360 |
| Trạng thái **nguồn** CANDIDATE / REVIEW_REQUIRED, không tự viết lại | 2.322 / 35 |
| Lớp còn giữ cờ nguồn / lượt cờ | 112 / 113 |
| Sheet ngoại lệ nguồn, gồm 3 placeholder | 115 |

Một lớp `FIN726_262_L14` có hai cờ nên 112 lớp có 113 lượt cờ. Cờ `UNMAPPED_SHIFT_TIME` của 8 lớp GDTC vẫn giữ như cảnh báo chưa biết giờ chính xác; `owner_derivation` ghi rõ lý do mở chặn bằng ca. Các cờ khác không bị xóa. Mọi lớp vẫn là `ELIGIBLE_PENDING_OWNER_APPROVAL`, không phải đã được owner phê duyệt công bố production.

## Tám lớp GDTC: ca S có phân biệt độ chính xác

| Mã lớp | Dòng Excel chuẩn | Tiết nguồn |
| --- | ---: | --- |
| `GYM302_262_PI_D17` | 195 | `4-5` / `3-5` |
| `GYM302_262_PI_D18` | 196 | `4-5` / `3-5` |
| `GYM304_262_PI_D52` | 268 | `4-5` / `3-5` |
| `GYM304_262_PI_D53` | 269 | `4-5` / `3-5` |
| `GYM304_262_QV_D27` | 270 | `1-3` / `1-2` |
| `GYM304_262_QV_D28` | 271 | `1-3` / `1-2` |
| `GYM304_262_QV_D54` | 272 | `1-3` / `1-2` |
| `GYM304_262_QV_D55` | 273 | `1-3` / `1-2` |

Chỉ đoạn `1-2`/`3-5` trong đúng 8 mã này được đổi thành `segments.shift='S'`, `shift_code='S'`, `timing_precision='owner_half_day'`, `start_time=end_time=NULL`. Ký hiệu tiết nguyên văn còn trong `raw_schedule`, `shift_raw` và `owner_derivation`. Đoạn có giờ chuẩn `1-3`/`4-5` của cùng lớp vẫn giữ giờ chính xác đã kiểm chứng. 2.349 lớp khác không thay trường nội dung hoặc ánh xạ giờ.

Để không bị các consumer cũ tự đổi `S` thành 07:00–11:05, cột TEXT `course.shift` dùng nhãn tự mô tả cho đoạn chưa biết giờ, ví dụ **`S (dự kiến theo owner, tiết 3-5)`**. Đây là cách tuần tự hóa ca S dự kiến, không phải giờ của trường. `general_note` cũng nêu rõ nguồn quyết định. Nhãn đi cùng dữ liệu khi copy vào snapshot lịch cá nhân; không phụ thuộc việc mọi caller có copy metadata phụ hay không.

- Desktop và mobile phân loại đoạn đó vào ca S, hiển thị dự kiến/giờ chưa công bố. Không thay layout, typography hoặc spacing. Giờ ở trục ca chung là khung tham chiếu của ca, không phải giờ riêng của đoạn dự kiến.
- Parser lịch cá nhân giữ độ chính xác và tiết gốc, không điền `startTime`/`endTime`; serialize round-trip giữ nhãn dự kiến. Khoảng giờ chính xác trả NULL. Xung đột trong cùng thứ/tuần/ca được kiểm tra bảo thủ; không thể kết luận hai tiết không trùng khi chưa có giờ.
- Không cho editor chuyển đoạn chưa biết giờ thành một buổi tự khai có giờ mặc định. Không mở rộng whitelist hoặc quyền ghi của course authority.
- ICS bỏ qua **chỉ các đoạn chưa biết giờ**, báo `unknown_shift` qua cơ chế cảnh báo hiện có, không tạo DTSTART/DTEND/VALARM cho chúng. Các đoạn đã có giờ xác minh vẫn được xuất. Không đổi S/C của HK1 hoặc các ca nguồn đã xác minh sang quy tắc mới.
- Push hiện hành về quyết định duyệt yêu cầu lớp chỉ gửi kết quả yêu cầu, không suy ra giờ học. PR không tạo job nhắc học theo giờ chưa công bố. Các nhắc lịch từ ICS cũng không được tạo cho đoạn dự kiến.

## Ba mục tạm: giữ đủ dòng, không tạo lớp giả

Chi tiết và phương án schema riêng: [TEMPORARY_ITEMS.md](TEMPORARY_ITEMS.md). Preview dẫn xuất: `generated/temporary-items.json`.

| Dòng Excel advanced | Tên hiển thị | Nhãn mã | Tín chỉ | Lịch hoạt động |
| ---: | --- | --- | --- | --- |
| 1214 | Kiến tập (3 đợt) | Mã lớp chưa công bố | 1 | Chưa công bố lịch học cố định |
| 1320 | Thực tập giữa khóa | Mã lớp chưa công bố | NULL — Tín chỉ chưa công bố | Chưa công bố lịch học cố định |
| 1321 | Thực tập giữa khóa | Mã lớp chưa công bố | NULL — Tín chỉ chưa công bố | Chưa công bố lịch học cố định |

Mỗi mục có `technical_key=hk2tmp:SHA256(source_sha256 + sheet + source_row)`. Hai dòng thực tập giống nội dung vẫn có khóa khác vì khác dòng nguồn. `official_course_code=NULL`; `_262_` chỉ giữ trong provenance. Không dùng technical key làm mã lớp hoặc UUID lớp chính thức.

Nguồn có `S/C`, thứ 6 và tuần `1-22` được giữ nguyên **trong provenance**, không biến thành lịch học cố định. View model có day/shift/weeks/room/campus NULL và segments rỗng. Tìm kiếm ở preview riêng trả cả hai dòng thực tập, có dòng nguồn để phân biệt; `_262_` không được dùng làm gợi ý tìm mã lớp chính thức. Select/add lịch cá nhân/ICS/xung đột đều tắt. Các consumer lịch/ICS còn từ chối record kind tạm nếu caller vô tình chuyển kèm trường lịch nguồn.

**Ba mục hiện ở artifact/preview review, chưa được gắn vào danh mục production.** Schema `course_schedules` hiện bắt buộc `course_code` và chưa có record kind tạm/capabilities. PR không tạo mã giả, không lách authority bằng ba `_262_`, không thêm endpoint hoặc migration ghi để đưa chúng vào bảng đó. Owner phải duyệt phương án schema/API/UI riêng trước khi muốn hiển thị mục tạm trực tiếp trong ứng dụng.

## Các quy tắc nguồn còn nguyên

- Mã/tên/tín chỉ/ngành/khóa/nhóm/đợt/ghi chú và quan hệ nhiều buổi đối chiếu theo từng dòng nguồn. Hệ chuẩn `academic_program=NULL`; các tên khác khớp HK1: `Tiếng Anh bán phần`, `Chương trình đặc biệt`, `CT Elite`. Giảng viên không lấy từ HK1.
- Ca chính xác vẫn là S→07:00–11:05, C→13:00–17:05, 1-3→07:00–09:15, 4-5→09:35–11:05, 6-8→13:00–15:15, 9-10→15:35–17:05. Broadcast singleton, từ chối mảng nhiều dòng lệch độ dài. Phòng có dấu cách không bị tách thành nhiều phòng.
- Cơ sở TĐ→TD, 36 TTĐ-SG/39HN - SG→Q1; dữ liệu gốc còn trong provenance. 109 lớp chưa có phòng/lịch thi giữ NULL. 124 tiểu luận không có ngày/ca thi giả; tổng exam_date NULL vẫn 233.
- Giữ nguyên 8 mã `_GHÉP`, không gộp/tách lớp. Giữ 78 lịch thi phần mềm 19–21/07 khi hè bắt đầu. 4 lớp chuẩn thi Chủ nhật 25/04 cần owner/trường xác nhận. 15 marker điều chỉnh nằm trong ghi chú, không biến thành phòng thi.
- Đủ 22 tuần: 15–21/02 đến 12–18/07/2027; hè từ 19/07. Ngày nghỉ 16–18/04, 30/04–03/05; chỉ advanced có 09–11/07 và online 15–20/02. Không biến thành holidayWeeks. `academicCalendar.ts` đã đúng và không sửa.
- Hai Excel ghi dự kiến; tiêu đề chuẩn lặp khóa 41, dòng thực tế có 40/41/42; tiêu đề advanced ghi năm khác thời điểm tên tệp. Chưa xác minh được thông báo trực tuyến mới hơn vì công cụ web không truy cập được trang trường trong phiên đối chiếu ban đầu.

## Dry-run, idempotency và bằng chứng

```powershell
npm run courses:hk2:dry-run
node scripts/prepare-hk2-course-import.mjs --check
node scripts/prepare-hk2-course-import.mjs --snapshot=path/to/fresh-readonly-snapshot.json
npm run test:hk2-import
```

Script chỉ chuẩn bị/check artifact, không có network, D1 credentials, SQL executor hoặc apply/remote mode. Dry-run hiện đề xuất **2.357 additions chính thức, 0 blocked, 0 conflict**, và liệt kê riêng **3 temporary_items không được import chính thức**. `can_apply=false`, `requires_owner_approval=true`. Dữ liệu đã published khớp hoàn toàn là no-op; khác nội dung/retired/mã HK2 ngoài gói/trùng khóa thì dừng. Ba mục tạm có khóa riêng không tham gia khóa tự nhiên course authority.

`production-readonly.json` vẫn là snapshot lịch sử SELECT ngày 19/11/2026: HK1 2.103 published, HK2 0, hè cũ 2; cả 5 truy vấn có rows_written=0 và changed_db=false. Không tuyên bố đó là trạng thái realtime ngày 20/11. Chỉ mục khóa tự nhiên không unique và HK1 đã có ba nhóm mã trùng; không thêm unique index toàn bảng hay sửa dữ liệu cũ. `preflight.sql` đọc tất cả HK2 gồm retired; validator từ chối snapshot sai scope, thiếu/schema/count hoặc có ghi. Bằng chứng tests, hash và CI: [VALIDATION.md](VALIDATION.md).

## Owner cần duyệt trước production

1. Review quyết định dẫn xuất, hash/payload, phạm vi **2.357 lớp chính thức**, các cờ còn lại và cách hiển thị/xuất bỏ qua giờ chưa biết. Quyết định quy đổi ca đã được yêu cầu trong chat; quyền công bố production chưa được cấp.
2. Đọc lại SELECT hiện hành, schema/count/khóa, hash HK1 và bảng người dùng, max source_position; lấy backup/Time Travel và thử phục hồi ở môi trường riêng. Chạy lại dry-run với snapshot mới; dừng nếu khác hoặc xung đột.
3. Duyệt riêng writer/procedure bulk có transaction, kiểm tra khóa tự nhiên trong cùng transaction để chống race, source key/receipt/provenance, replay, postconditions và rollback theo batch. PR này không có writer production; không dùng test-only fixture writer.
4. Phát hành logic hiển thị/ICS/độ chính xác qua release guard hiện hữu trước/cùng công bố. Không bỏ guard, thay authority, cấp quyền mới, xóa/ghi đè HK1 hoặc dữ liệu người dùng. Không chạy `scripts/seed-course-schedules-d1.mjs` trên production.
5. Ba mục tạm cần phê duyệt riêng phương án trong `TEMPORARY_ITEMS.md`; chưa đủ điều kiện công bố như lớp chính thức. Khi trường cấp mã/tín chỉ/lịch thật, reconcile theo technical key và nguồn mới, không tự gộp hai dòng thực tập, không sửa byte nguồn cũ.

PR dừng ở trạng thái sẵn sàng review; không tự merge, deploy hoặc ghi production D1.
