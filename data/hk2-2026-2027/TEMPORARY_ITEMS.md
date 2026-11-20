# Phương án riêng cho ba mục học phần tạm

## Trạng thái của PR #159

Ba dòng advanced 1214, 1320, 1321 được giữ đủ trong `generated/catalogue.json.temporary_items` và `generated/temporary-items.json`. Đây là dữ liệu chuẩn bị/preview review, **không phải ba lớp đã tồn tại trong catalogue ứng dụng**. Không ghi D1, không tạo migration, endpoint hay quyền ghi mới trong PR này.

`course_schedules` hiện yêu cầu `course_code NOT NULL`, và API/authority coi mỗi row là lớp có thể được chọn vào lịch. Không thể đưa ba `_262_` vào an toàn bằng cách thay mã giả, dùng source key như mã chính thức hoặc lợi dụng visibility retired. Vì vậy luồng import chính thức chỉ nhận 2.357 lớp có mã trường; planner từ chối record kind `temporary_subject`.

## View model chuẩn bị

| Dòng | Tiêu đề | Nhãn mã | Tín chỉ | Phân biệt |
| ---: | --- | --- | --- | --- |
| 1214 | Kiến tập (3 đợt) | Mã lớp chưa công bố | 1 | Dòng nguồn 1214 · Chờ mã chính thức |
| 1320 | Thực tập giữa khóa | Mã lớp chưa công bố | Tín chỉ chưa công bố (NULL) | Dòng nguồn 1320 · Chờ mã chính thức |
| 1321 | Thực tập giữa khóa | Mã lớp chưa công bố | Tín chỉ chưa công bố (NULL) | Dòng nguồn 1321 · Chờ mã chính thức |

Mỗi dòng giữ technical key ổn định `hk2tmp:SHA256(source_sha256:sheet:source_row)` và `official_course_code=NULL`. `_262_` chỉ là `provenance.source_course_code`. Không gộp theo tên môn hoặc mã nguồn, kể cả hai dòng thực tập có nội dung giống hệt. Giảng viên NULL; không điền 0 cho tín chỉ còn thiếu.

Lịch nguồn `S/C`, thứ 6, tuần 1–22 được giữ nguyên dưới provenance. Nó chưa chứng minh lịch học cố định của kiến tập/thực tập. Mục tạm có `segments=[]`, ngày/ca/tuần/phòng/cơ sở hoạt động NULL và nhãn “Chưa công bố lịch học cố định”.

## Hành vi và ranh giới hiện tại

- Tìm kiếm trong **preview riêng** theo tên/nhãn/dòng nguồn; tìm “Thực tập giữa khóa” trả hai mục có hai key. Không thêm `_262_` hoặc technical key vào gợi ý mã lớp của API official.
- View model dùng chung cho desktop/mobile có nhãn rõ, không có nút hoạt động: selectable, add-to-personal, ICS, conflicts đều false. Chưa gắn view model này vào UI catalogue production; việc gắn cần owner duyệt schema/API bên dưới.
- Không có UUID/course_code chính thức nên không được gửi như systemCourseId hoặc tạo user-added class thay thế. Không tạo user_course_requests/receipt/outbox hoặc lịch cá nhân từ ba dòng này.
- Parser buổi học và helper slot của cả hai component từ chối record kind tạm, kể cả caller vô tình chuyển kèm trường tuần nguồn. ICS cũng từ chối record kind này trước khi đọc tuần/ca, không tạo VEVENT hay alarm. Không tạo “trùng lịch” giả vì thứ 6/tuần 1–22.

## Phương án production cần owner duyệt riêng

1. Giữ `course_schedules` dành cho lớp có mã trường. Thiết kế bảng/collection provisional riêng, khóa kỹ thuật unique theo hash nguồn + sheet + dòng, `official_course_code` nullable, provenance đầy đủ, credits nullable, record kind và trạng thái publication riêng.
2. Thiết kế API đọc catalogue trả discriminator `official_class`/`temporary_subject`; search/facets phân biệt rõ. Phía server vẫn chỉ cho phép loại official được tra cứu theo UUID và authority hiện có để thêm lịch. Không cấp quyền ghi mới trong khi chưa review schema/authorization.
3. UI hiển thị mục tạm với ba nhãn ở trên và hàng động tác tắt; không dùng kỹ thuật đặt fake course_code rồi che bằng nhãn. Áp dụng view model và guards đã kiểm thử trong PR này; không thay layout desktop/mobile chỉ để hợp thức hóa dữ liệu.
4. Khi trường công bố mã, cần bản nguồn/hash mới và owner review mapping từng technical key sang lớp official. Hai dòng 1320/1321 cần quyết định riêng, không suy diễn là cùng lớp. Nếu tín chỉ/lịch chưa có thì tiếp tục NULL/không có buổi; không tự tạo lịch tuần.
5. Duyệt migration, API, consumer tests và rollout riêng qua course authority/release guard. Chỉ sau đó mới công bố provisional items trong ứng dụng. Phê duyệt 2.357 lớp official không tự bao gồm phê duyệt schema/publication cho ba mục tạm.

Đây là phương án review, chưa có bước ghi hoặc triển khai production được thực hiện.
