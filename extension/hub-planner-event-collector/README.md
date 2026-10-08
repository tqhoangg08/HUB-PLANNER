# HUB Planner - Facebook Event Collector v0.4

Extension Chrome Manifest V3 để gửi bài Facebook/website vào hệ thống dưới dạng `event_candidates`.

## Ảnh sự kiện v0.4

- Candidate được gửi trước. Ảnh chỉ được sao lưu khi người gửi chủ động xác
  nhận có quyền sử dụng và chọn cơ sở quyền. Checkbox mặc định chưa chọn.
- Worker thử tải ảnh công khai trong giới hạn 2 MB rồi lưu vào R2. Popup chỉ
  báo thành công khi trạng thái R2 được máy chủ xác nhận.
- Nếu Worker không tải được, popup thử gửi binary JPG/PNG/WEBP bằng endpoint
  được bảo vệ bởi token ingest hiện có. Có thể chọn tệp ảnh gốc hợp lệ từ máy.
  Không dùng cookie Facebook, không theo redirect, không tự lấy ảnh riêng tư.
- Candidate vẫn được gửi để duyệt nếu ảnh thất bại. Admin/Auditor có thể bổ
  sung banner bằng luồng upload thủ công hiện có.
- Quyền truy cập host được giới hạn vào API production và CDN ảnh Facebook.
  Token do người vận hành nhập được lưu ở Chrome local storage, không nằm trong
  mã extension hoặc Chrome sync.

## Thu thập nội dung từ v0.3

- Sửa lỗi lấy caption thành menu bên trái Facebook.
- Sửa logic chọn ảnh: ưu tiên ảnh lớn nằm ngay trong/vùng dưới caption của bài đang mở.
- Không fallback sang toàn bộ `body.innerText` nữa, vì dễ lấy nhầm menu Facebook.
- Có thể bôi đen caption trước khi bấm nút để extension lấy chính xác phần đã chọn.
- Có nút lấy ảnh từ tab ảnh riêng nếu Facebook không expose URL ảnh trong DOM bài viết.

## Cài đặt

1. Mở Chrome và vào `chrome://extensions`.
2. Bật `Developer mode`.
3. Chọn `Load unpacked`.
4. Chọn thư mục `C:\Users\tqhoa\OneDrive\Desktop\HUBPLANNER\hub_planner_extension_v0_3`
   chứa `manifest.json` (không chọn thư mục `icons`).

## Cách dùng

1. Mở bài Facebook cần gửi.
2. Bấm icon extension.
3. Bấm **Lấy link tab** nếu link chưa đúng.
4. Bấm **Lấy caption + ảnh**.
5. Kiểm tra lại caption và ảnh. Chỉ tích xác nhận quyền nếu thực sự có quyền
   lưu/sử dụng ảnh, chọn cơ sở quyền, rồi bấm gửi.

Nếu ảnh không lấy được, mở ảnh đó trong tab riêng rồi bấm **Lấy ảnh từ tab ảnh**.

## Payload gửi về API

```json
{
  "source_name": "CLB Tin học",
  "post_url": "https://www.facebook.com/...",
  "raw_content": "Caption bài viết...",
  "image_url": "https://scontent...jpg",
  "image_rights_confirmed": true,
  "image_rights_basis": "permission",
  "submitted_from": "chrome_extension",
  "client_created_at": "2026-05-07T10:00:00.000Z"
}
```

Nếu dùng token, extension gửi header:

```txt
Authorization: Bearer <token>
```

## Lưu ý

Facebook thay đổi DOM thường xuyên, nên auto-read không thể chắc 100%. Bản v0.3 tránh lấy nhầm bằng cách không dùng toàn bộ body làm nội dung bài viết.

Sau khi sửa source, vào `chrome://extensions` và bấm **Reload** cho extension
đã load. Nếu load từ đường dẫn unpacked mới, Chrome có thể cấp extension ID
khác; cần đối chiếu ID này với allowlist chính xác trên Public Worker trước khi
gửi dữ liệu thật. Deploy Worker không tự cập nhật extension local.
