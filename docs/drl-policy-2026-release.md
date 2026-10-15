# Release và phục hồi — chỉ cập nhật danh mục

Phạm vi cuối cùng theo yêu cầu chủ dự án: giữ nguyên logic form/API/AI/cache/candidate của base main. Các migrations phiên bản 0058/0059 trước đó chỉ từng nằm trong Draft PR, chưa chạy production, đã được thay bằng 0058_seed_drl_catalog_2026.sql.

## Migration dữ liệu

- Dùng schema 0052 hiện có, không thêm bảng/cột/index. Thêm 46 rule IDs mới từ nguồn đã kiểm; catalog API hiện có tự lấy 23 rule active và event suitable.
- INSERT OR IGNORE cùng kiểm tra toàn bộ giá trị chính thức; ID trùng nội dung/điểm khác làm thất bại migration thay vì ghi đè. Chạy trong transaction migration. Seed lặp không đổi kết quả.
- Chỉ chuyển active của các rules nguồn cũ từ 1 sang 0 để ngừng hiển thị. Giữ tất cả hàng, ID, nội dung, điểm, source_version, liên kết FK. Không sửa history, corpus, admin/public event, prediction cache hay trạng thái/duyệt candidate.
- Không chạy importer workbook hiện có vì chứa DELETE. Không tự ánh xạ rule cũ sang rule mới.

## Trước khi phát hành riêng

1. Chủ dự án review và duyệt riêng. Task này không merge, deploy hoặc ghi production.
2. Xuất snapshot danh mục drl_rules (đặc biệt active của từng ID), giữ bản sao ngoài Git; kiểm tra FK và danh sách migration đã áp dụng trên môi trường đích. Không dùng số workbook/local để suy số production.
3. Kiểm tra trên staging dữ liệu đại diện: sửa event có rule cũ inactive, candidate prediction cũ, cache cũ. Logic baseline có thể từ chối rule inactive khi lưu chỉnh sửa và có thể dùng lại cache không có rule; không bổ sung xử lý mới trong PR này.
4. Sau khi duyệt, áp dụng migration dữ liệu và frontend trong cửa sổ đã thống nhất. Không thay Worker vì mã runtime giữ nguyên. Kiểm danh mục 23 lựa chọn mới, phụ lục 5 mục/100 điểm, form desktop/mobile và quyền Admin/Auditor.

## Phục hồi

Dừng thao tác quản trị trong cửa sổ phục hồi. Khôi phục active của đúng các rule cũ từ snapshot trước migration; đặt active=0 cho source_version hub-drl-2026-5549-v1. Không bật hàng loạt tất cả rules cũ, không xóa rule mới vì có thể đã được event tham chiếu. Khôi phục frontend trước PR nếu cần. Giữ nguyên toàn bộ sự kiện, lịch sử, cache và candidate. Chuẩn bị migration bù cho ledger nếu cần, không sửa migration đã phát hành.

Lệnh D1 local sử dụng --local và config riêng không trỏ production theo [tài liệu Wrangler](https://developers.cloudflare.com/d1/wrangler-commands/). Kết quả thực chạy nằm trong báo cáo kiểm chứng; đây là kế hoạch, chưa có thao tác release nào.
