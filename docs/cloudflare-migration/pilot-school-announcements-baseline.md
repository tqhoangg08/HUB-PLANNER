# Baseline pilot `school_announcements`

Thời điểm chụp baseline: 2026-07-30, múi giờ Asia/Saigon.

Baseline chỉ chứa metadata và số đếm, không chứa nội dung thông báo.

## Schema nguồn Supabase

| Thứ tự | Cột | PostgreSQL type | Nullable | Default |
|---:|---|---|---|---|
| 1 | `id` | `bigint` | Không | Identity |
| 2 | `title` | `text` | Không | |
| 3 | `link` | `text` | Không | |
| 4 | `date` | `text` | Có | |
| 5 | `is_new` | `boolean` | Có | `false` |
| 6 | `created_at` | `timestamptz` | Có | `now()` |
| 7 | `is_hidden` | `boolean` | Có | `false` |

## Số liệu đối chiếu ban đầu

- Tổng số dòng: 5.505
- Dòng hiển thị: 5.482
- Dòng ẩn: 23
- Link khác nhau: 5.505
- `created_at` sớm nhất: `2026-02-05 04:33:23.281227+00`
- `created_at` mới nhất: `2026-07-30 07:45:32.212512+00`

## Hợp đồng API cần giữ nguyên

Request hiện tại:

```text
GET /events?resource=announcements
```

Query parameters:

- `limit`: mặc định 10, tối đa 60.
- `offset`: mặc định 0.
- `search`: tìm không phân biệt hoa thường trong `title`.
- `startDate`: `date >= startDate`.
- `endDate`: `date <= endDate`.

Response:

```json
{
  "success": true,
  "data": [],
  "total": 0,
  "hasMore": false
}
```

Thứ tự:

1. `date` giảm dần.
2. `created_at` giảm dần.

Chỉ trả các dòng có `is_hidden = false` hoặc `is_hidden IS NULL`.

Các cột trả về:

```text
id,title,link,is_new,date,created_at
```

## Tiêu chí khớp shadow

Với cùng một query, Supabase và D1 phải khớp:

- HTTP status.
- Tổng số dòng `total`.
- `hasMore`.
- Số phần tử trong `data`.
- Thứ tự `id`.
- Sáu cột trả về của từng phần tử.

Các trường hợp tối thiểu phải test:

1. `limit=4`.
2. `limit=10`.
3. `limit=20&offset=20`.
4. Tìm kiếm có dấu.
5. Tìm kiếm không có kết quả.
6. Chỉ `startDate`.
7. Chỉ `endDate`.
8. Kết hợp `startDate` và `endDate`.
9. `limit` lớn hơn 60.
10. `offset` âm hoặc không hợp lệ.
