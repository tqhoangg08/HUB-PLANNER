# Kế hoạch kiểm tra và phát hành ĐRL 2026

Task này dừng ở Draft PR. Không merge, deploy, chạy migration/import remote, ghi D1/R2 production, sửa Auth Worker hoặc thay đổi rollout AI Advisor.

## Migration bổ sung

1. `0058_drl_policy_versions.sql`: thêm metadata phiên bản, context nullable cho event/cache/candidate, indexes và bảng/trigger audit prediction. Không backfill các hàng cũ, không xóa dữ liệu và không thay trạng thái candidate. FK mới của event context tham chiếu metadata quy chế; FK rule cũ giữ nguyên.
2. `0059_seed_drl_policy_2026.sql`: thêm 46 IDs mới bằng INSERT OR IGNORE, sau đó đối chiếu **mọi trường** và tổng số rules của phiên bản bằng CHECK constraint. ID trùng nhưng khác nội dung/điểm sẽ làm seed thất bại, không ghi đè. Nguồn sinh SQL là `utils/drlPolicy2026.ts`; tái sinh bằng `node --experimental-strip-types scripts/build-drl-policy-seed.mjs`.
3. Wrangler quản lý ledger cho schema migration có ALTER TABLE; không chạy lại SQL 0058 trực tiếp. Seed 0059 có thể chạy lặp và không thay đổi hàng đã đúng. Không sửa migration 0052 đã phát hành.

`scripts/import-event-drl-history.mjs --apply` đã bị khóa vì đường cũ có DELETE toàn corpus/rules/cache. Dry-run kiểm workbook vẫn dùng được. Cập nhật quy chế không cần import lại workbook; chưa thiết kế hay thực hiện một lần thay corpus mới trong task này.

## Kiểm tra local và phục hồi

- `tests/event-drl-policy.test.ts` chạy schema thật trên SQLite với foreign keys bật. Test đối chiếu toàn bộ 2.750 hàng **giả lập**, rule/điểm của hai projection, cache cũ, seed lặp và xung đột ID; không dùng dữ liệu cá nhân hoặc production.
- `node scripts/test-drl-policy-d1-local.mjs` tạo config/DB local riêng dưới `.cache/drl-d1-<timestamp>`, chỉ có binding D1 giả lập, không Auth/R2/remote. Áp schema nền tối thiểu, nạp fixture giả lập trước migration mới, chạy migration apply hai lần qua ledger, seed lặp và `PRAGMA foreign_key_check`. File log local không được commit.
- Nguồn chính thức có thể đối chiếu lại bằng `python -X utf8 scripts/verify-drl-policy-source.py <path-to-official-docx>`; script kiểm SHA, 71 hàng phụ lục, quyết định/ngày/năm áp dụng và hai ghi chú, không copy Word vào repo. Renderer Word chưa chạy được vì thiếu LibreOffice; không coi kiểm tra phân trang trực quan là PASS.

## Trước release cần chủ dự án quyết định riêng

1. Xác nhận các điểm chưa rõ và phân loại event suitable trong [bảng đối chiếu](drl-policy-2026-crosswalk.md). Không suy diễn cộng dồn/khấu trừ/áp trần; không xây bộ tính điểm sinh viên trong task này.
2. Đối chiếu trực quan trang 8–10 và bảng chi tiết theo năm học nếu Trường có văn bản hướng dẫn bổ sung. Xác minh quy chế cũ trước khi ghi nhãn chính thức theo năm.
3. Kiểm tra metadata/ledger và số lượng thực tế ở staging/production trong một phiên được cho phép riêng; không lấy số liệu workbook làm số liệu D1. Xác minh 0058/0059 chưa bị trùng số bởi thay đổi khác trên main.
4. Tạo snapshot/backup được kiểm tra khả năng phục hồi cho rules, metadata, history, events, cache và candidates trước migration remote. Lưu hash và số hàng theo từng bảng/source_version; hậu kiểm so sánh các hàng lịch sử, observed codes, approvals, điểm và IDs cũ.
5. Rehearsal schema + seed trên staging từ snapshot phù hợp. Với Worker cũ còn hoạt động, **không áp cả 0058 và 0059 trước khi đổi code**: predictor cũ đọc mọi rule active, có thể trộn hai quy chế. Lập cửa sổ bảo trì cho ĐRL, áp schema 0058 trước, triển khai Worker/frontend hiểu phiên bản, rồi áp seed 0059 và kiểm tra. Trong khoảng chưa seed đủ 46 hàng, code mới từ chối catalog/prediction/chọn rule thay vì phục vụ danh mục thiếu. Kiểm tra cả desktop/mobile, quyền Admin/Auditor, contribution và extension ingest; client cũ cần tải lại. Chỉ thực hiện khi có phê duyệt riêng; không dùng production cho rehearsal và không chạy lệnh apply-all remote theo thói quen.
6. Xác nhận trạng thái AI Advisor thực tế trước release: base main đã khác snapshot được nêu trong yêu cầu. Task này không kiểm tra hoặc thay traffic/rollout của AI Advisor; các tests trên main có nhắc rollout 100%, không phải bằng chứng trạng thái production.

## Rollback hoặc phục hồi

- Trước khi có ghi mới: giữ schema/rows bổ sung, rollback application chỉ sau khi kiểm khả năng tương thích. Không chạy DROP/DELETE hoặc importer replacement để “undo”.
- Khi đã có event theo quy chế 2026: ưu tiên forward-fix và giữ backend hiểu phiên bản. Không quay thẳng về predictor trên main cũ vì nó đọc mọi rule active và không biết boundary policy.
- Nếu cần tạm ngừng nhận ĐRL mới, chủ dự án có thể duyệt một thao tác riêng đặt metadata policy mới inactive và các rules mới inactive. Giữ nguyên IDs, điểm snapshot, cache và audit; UI đọc phụ lục tĩnh và các chỉnh sửa không đổi ĐRL lịch sử vẫn được bảo toàn. Phải kiểm thử thao tác đó trên staging trước khi production.
- Nếu migration bị ngắt: kiểm ledger và CHECK guard; chạy lại phần seed idempotent sau khi xác định nguyên nhân, không sửa ID trùng để ép thành công. Khôi phục snapshot đã kiểm chứng vào DB staging riêng để so sánh; mọi phục hồi production cần phê duyệt riêng và phải bảo toàn các ghi mới phát sinh.

Kết quả thực chạy và giới hạn được ghi trong `docs/drl-policy-2026-validation.md` khi hoàn tất kiểm thử. Các kế hoạch remote ở trên chưa được thực thi.
