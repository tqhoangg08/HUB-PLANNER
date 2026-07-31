# Migration xếp hạng học tập sang Cloudflare D1

Ngày chuẩn bị: 2026-07-31.

## Phạm vi

- Giữ nguyên toàn bộ giao diện dự báo xếp hạng hiện tại.
- Danh sách học kỳ, tổng sinh viên và dự báo theo GPA/điểm rèn luyện/tín chỉ
  được đọc từ D1.
- Kết quả xếp hạng đã tính sẵn của người dùng chỉ được đọc qua endpoint có
  access token và chỉ theo `user_id` của phiên đăng nhập.
- Không lưu mã sinh viên trong D1.
- API công khai không trả GPA, mã sinh viên, mã lớp hoặc danh sách sinh viên.
- Frontend tự fallback về Supabase nếu D1/Worker chưa sẵn sàng.

## Dữ liệu D1

- `benchmark_ranking_semesters`: tổng theo học kỳ.
- `benchmark_ranking_scopes`: tổng theo toàn trường/ngành.
- `benchmark_ranking_buckets`: bucket điểm và thứ hạng, không có danh tính.
- `benchmark_ranking_users`: kết quả riêng tư gắn với `user_id`, chỉ Worker
  được truy cập.

Khóa `score_key` có index giúp một dự báo tìm đúng một bucket gần nhất, tránh
quét hàng nghìn dòng và giảm `rows_read`.

## Kết quả local

- Nguồn Supabase: 36.044 dòng, 4 học kỳ.
- D1: 29.371 bucket tổng hợp.
- D1: 1.778 kết quả riêng tư có thể gắn an toàn với tài khoản.
- Đối chiếu 5 mức điểm của học kỳ `2025-2026_HK1`: khớp 5/5 cả hạng và tổng.
- Endpoint riêng tư không có token trả HTTP 401.
- Origin ngoài allowlist trả HTTP 403.
- Query plan dùng index `benchmark_ranking_buckets_score_idx`.

## Thứ tự chạy remote

```powershell
npm run cf:d1:migrate:remote
npm run cf:d1:seed:rankings:remote
npm run cf:deploy:dev
```

Sau đó test web ở cả desktop và mobile:

1. Mở bảng dự báo xếp hạng.
2. Kiểm tra danh sách 4 học kỳ.
3. Chọn học kỳ hiện tại và xác nhận hạng toàn trường/lớp/ngành.
4. Chọn một học kỳ cũ và xác nhận hạng dự báo.
5. Đăng xuất rồi mở lại trang; không được thấy dữ liệu riêng tư của phiên cũ.

Nếu Worker chưa deploy hoặc D1 chưa seed, frontend vẫn dùng Supabase nên không
làm trắng trang hoặc chặn người dùng.
