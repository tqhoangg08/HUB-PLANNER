# Kế hoạch chuyển HUB Planner sang Cloudflare an toàn

Tài liệu này là checklist vận hành. Mỗi giai đoạn phải hoàn tất bước kiểm tra
và rollback trước khi chuyển sang giai đoạn kế tiếp.

## Nguyên tắc bắt buộc

1. Không tắt, xóa hoặc sửa dữ liệu Supabase trong lúc thử nghiệm.
2. Không chuyển dữ liệu riêng tư trước dữ liệu công khai.
3. Mọi đường đọc mới phải có feature flag để quay về Supabase ngay.
4. Không tự triển khai Auth, OTP hoặc lưu mật khẩu trong Cloudflare Worker.
5. Giữ Supabase Auth trong giai đoạn đầu; Worker chỉ xác minh JWT khi cần.
6. Không commit file dump, secret, database URL hoặc service-role key.
7. Chỉ cutover sau khi kết quả Supabase và D1 khớp trong giai đoạn shadow.

## Trạng thái trước migration

- Ngày lập kế hoạch: 2026-07-30.
- Nhánh: `main`.
- Codebase có 396 file, trong đó 124 file có tham chiếu Supabase.
- Database có 44 bảng trong schema `public`.
- Có 73 migration, 212 RLS policy, 55 PostgreSQL function, 24 trigger và
  21 thư mục Edge Function.
- Bản tối ưu Auth hiện vẫn là thay đổi local chưa commit; migration không được
  ghi đè hoặc trộn logic vào các file đó.

## Backup và đường lui

Bản backup trước migration:

- File local: `database_backups/hubplanner_pre_d1_2026-07-30.dump`
- Định dạng: PostgreSQL custom archive, gzip
- Kích thước: 20,911,230 byte
- TOC: 972 mục
- SHA-256:
  `FDBC7CD5EF06E42E8C4A3056EEC8A67518DEBB41E6ADD88BF92AD6210716544C`
- File thuộc `database_backups/`, đã được `.gitignore` bỏ qua.
- Đã kiểm tra bằng `pg_restore --list`.

Không cần restore backup trong migration bình thường. Chỉ dùng backup nếu dữ
liệu gốc Supabase bị thay đổi ngoài ý muốn.

## Kiến trúc đích giai đoạn đầu

```text
React/Vercel
    |
    +-- Supabase Auth (giữ nguyên)
    |
    +-- Cloudflare Worker
            |
            +-- D1: dữ liệu đọc công khai trước
            +-- R2: file công khai ở giai đoạn sau

Supabase Postgres vẫn là nguồn dữ liệu chuẩn cho tới khi cutover từng bảng.
```

## Feature flag và các chế độ

Mỗi tài nguyên được chuyển phải hỗ trợ ba chế độ:

- `supabase`: chỉ đọc đường cũ; đây là chế độ rollback.
- `shadow`: người dùng nhận kết quả đường cũ, ứng dụng đồng thời đối chiếu D1
  nhưng không để lỗi D1 ảnh hưởng giao diện.
- `cloudflare`: đọc D1; nếu request lỗi hoặc timeout thì fallback đường cũ.

Không xóa chế độ `supabase` cho tới khi đã chạy ổn qua ít nhất một chu kỳ quota.

## Pilot 1: thông báo trường

Bảng đầu tiên là `school_announcements`.

Lý do:

- Dữ liệu đã được phép đọc công khai.
- Giao diện chỉ cần các cột:
  `id`, `title`, `link`, `is_new`, `date`, `created_at`.
- API hiện có phân trang, tìm kiếm và lọc ngày rõ ràng.
- Giao diện đã có cache ngắn hạn.
- Crawler, trigger, hàng đợi push và thao tác ghi có thể tiếp tục ở Supabase.
- Nếu D1 gặp lỗi, đường đọc có thể quay về API hiện tại mà không mất dữ liệu.

Trong pilot này:

- Supabase vẫn là nguồn ghi duy nhất.
- D1 chỉ là read replica.
- Không chuyển `school_announcement_push_queue`.
- Không sửa crawler hoặc push notification.
- Không thay đổi giao diện.

## Các giai đoạn và cổng kiểm tra

### Giai đoạn 0 — Hoàn thiện nền an toàn

- [x] Kiểm tra Git và bảo vệ thay đổi đang dở.
- [x] Tạo backup mới.
- [x] Kiểm tra backup đọc được.
- [x] Lập inventory database.
- [x] Chọn bảng public đầu tiên.
- [x] Lưu một bản schema/row-count dùng để đối chiếu pilot.

### Giai đoạn 1 — Chạy Cloudflare hoàn toàn ở local

- [x] Cài Wrangler dưới dạng dev dependency.
- [x] Tạo Worker trong thư mục riêng, không ảnh hưởng Vite/Vercel.
- [x] Tạo D1 local.
- [x] Tạo schema SQLite chỉ cho `school_announcements`.
- [x] Import bản sao dữ liệu đã lọc cột.
- [x] Viết endpoint tương thích với `/events?resource=announcements`.
- [x] Test limit, offset, search, startDate và endDate.
- [x] Không deploy.

Kết quả local ngày 2026-07-30:

- D1: 5.505 tổng, 5.482 hiển thị, 23 ẩn, 5.505 link duy nhất.
- Shadow comparison: khớp 10/10 trường hợp với API production hiện tại.
- Worker chỉ hỗ trợ GET/OPTIONS và CORS theo allowlist.

Cổng kiểm tra: test local phải qua; `npm run typecheck`, unit test và build chính
phải vẫn qua.

### Giai đoạn 2 — Tạo tài nguyên Cloudflare development

- [x] Đăng nhập Wrangler.
- [x] Tạo D1 development.
- [x] Deploy Worker development.
- [x] Thiết lập CORS chỉ cho localhost và domain ứng dụng.
- [x] Không đặt Supabase service-role key trong frontend.

Cổng kiểm tra: endpoint development trả đúng schema JSON, không sửa production.

Trạng thái ngày 2026-07-30:

- D1: `hub-planner-public-dev`
- Region: APAC
- Database ID: `88d702e1-60d3-490a-8514-38ef881cf133`
- Dung lượng sau import: khoảng 5,36 MB
- Remote rows: 5.505 tổng, 5.482 hiển thị, 23 ẩn
- R2 bucket có sẵn `hub-planner` không bị thay đổi
- Account subdomain: `tqhoangg2.workers.dev`
- Worker development:
  `https://hub-planner-public-dev-api.tqhoangg2.workers.dev`
- Version kiểm tra đầu tiên: `f7022348-db0a-486c-9cf6-1dd2428b909c`
- Version có đồng bộ theo giờ: `1e9d0c02-1939-44d8-b15f-e85ccdba6e95`
- Lịch đồng bộ tăng dần: phút 17 mỗi giờ
- Supabase anon key được lưu bằng Cloudflare secret, không nằm trong repository
- Health: HTTP 200
- Allowed production origin: HTTP 200 và có header CORS đúng
- Origin ngoài allowlist: HTTP 403
- Phương thức POST: HTTP 405
- Shadow comparison online: khớp 10/10 trường hợp
- Frontend production dùng Worker cho thông báo trường, với fallback về API cũ nếu lỗi

### Giai đoạn 3 — Shadow read

- [x] Thêm adapter ba chế độ `supabase`, `shadow`, `cloudflare`.
- [ ] Production vẫn trả dữ liệu Supabase cho người dùng.
- [ ] So sánh ID, thứ tự, tổng số dòng và dữ liệu của từng trang với D1.
- [ ] Ghi log mismatch nhưng không chứa thông tin riêng tư.
- [ ] Chạy đủ các trường hợp tìm kiếm và lọc ngày.

Cổng kiểm tra: không mismatch trong ít nhất 48 giờ và không tăng lỗi giao diện.

### Giai đoạn 4 — Cutover riêng bảng pilot

- [x] Chuyển flag thông báo trường sang `cloudflare`.
- [x] Giữ fallback Supabase khi timeout/lỗi.
- [ ] Theo dõi lỗi, độ trễ và Supabase egress.
- [ ] Có thể rollback chỉ bằng đổi flag.

Cổng kiểm tra: chạy ổn ít nhất 7 ngày.

### Giai đoạn 5 — Mở rộng có kiểm soát

Thứ tự dự kiến:

1. Các danh sách public/read-heavy khác.
2. File công khai sang R2.
3. Dữ liệu authenticated ít nhạy cảm.
4. Dữ liệu cá nhân và phân quyền phức tạp.
5. Edge Functions.
6. Auth chỉ được xem xét cuối cùng.

## Khi nào phải dừng

Dừng và rollback pilot nếu có một trong các dấu hiệu:

- D1 trả thiếu hoặc sai thứ tự dữ liệu.
- Search/lọc ngày cho kết quả khác Supabase.
- Worker vượt giới hạn request/CPU.
- CORS cho phép origin ngoài danh sách.
- Có secret xuất hiện trong bundle frontend hoặc Git.
- Giao diện trắng, loading vô hạn hoặc tỷ lệ lỗi tăng.

## Những việc chưa được phép làm

- Không tạo bảng chứa password/OTP trên D1.
- Không di chuyển `profile_private_data`, `auth_otp_codes`,
  `policy_consents` hoặc `user_roles` trong pilot đầu tiên.
- Không dual-write từ trình duyệt.
- Không xóa migration Supabase.
- Không đổi DNS/domain production trong giai đoạn local.
