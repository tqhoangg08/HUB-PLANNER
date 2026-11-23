# Audit Cloudflare D1 — HUB Planner, 23/11/2026

Thay đổi dành riêng cho review, dựa trên main `eaa2a55`. Chưa merge, deploy hoặc áp dụng migration. Không sửa UI, dữ liệu production, cấu hình Auth/bảo mật hay các nhánh PR khác. Chỉ đọc Analytics; các truy vấn `EXPLAIN QUERY PLAN` trên production đều có `rows_read=0`, `rows_written=0`, `changed_db=false`. Một lần đọc `sqlite_master` bị quota từ chối, không thử lại truy vấn dữ liệu.

## Bằng chứng và giới hạn

Analytics `d1AnalyticsAdaptiveGroups` xác nhận số dưới đây. Ngày là **UTC** theo quota Cloudflare; reset 00:00 UTC = 07:00 giờ Việt Nam. Auth dùng database khác nhưng chung quota tài khoản.

| Ngày UTC | hub-planner-public-dev | Auth database | Tổng tài khoản |
|---|---:|---:|---:|
| 20/11 | 6.740.470 | 107.036 | 6.847.506 |
| 21/11 | 7.885.259 | 45.140 | 7.930.399 |
| 22/11 | 6.638.920 | 35.706 | 6.674.626 |

Query Insights được lấy riêng từng ngày, tối đa 1.000 nhóm/ngày; thực tế trả 373/233/171 nhóm. Tổng rows quy được cho query là 5.734.326 / 7.620.023 / 6.482.296, thấp hơn bộ đếm database. Giữ phần thiếu 1.006.144 / 265.236 / 156.624 là **chưa phân bổ**, không nhân bù và không giả định mẫu đầy đủ. Insights không cung cấp bound parameters, trạng thái gate hay danh tính caller. Không suy ra số người dùng hoặc kết luận chắc chắn một query đến từ cron chỉ từ câu SQL.

- [Insights gốc theo ngày](benchmarks/d1-audit-daily-2026-11-20-22.json), [phân nhóm và sensitivity](benchmarks/d1-audit-summary.json).
- [EXPLAIN production](benchmarks/d1-audit-production-explain.json), [metadata bị quota từ chối](benchmarks/d1-audit-production-schema.json).
- [Inventory 562 prepare và 54 batch trong 52 file Public/Auth](benchmarks/d1-query-inventory.json). Biểu thức SQL động được giữ nguyên để truy ngược nơi xây dựng; đây là inventory tĩnh, không phải chứng minh mọi nhánh đều đã có traffic.
- [Tài liệu Cloudflare về Analytics và bộ đếm rows](https://developers.cloudflare.com/d1/observability/metrics-analytics/), [cách tính phí/quota](https://developers.cloudflare.com/d1/platform/pricing/).

## Nguyên nhân theo mức tiêu thụ quan sát được

| Nhóm SQL | 20/11 | 21/11 | 22/11 | Nhận định |
|---|---:|---:|---:|---|
| Facet môn học, gồm count | 2.236.938 | 4.176.221 | 5.059.604 | Lớn nhất; bốn aggregate quét lặp, mỗi statement mang gate HK2 |
| Snapshot/import guards có hình dạng operator¹ | 101.044 | 2.218.355 | 65.787 | Đột biến ngày 21; không được thay bằng kiểm tra lỏng hơn |
| Các query course khác | 1.521.534 | 588.743 | 833.659 | List/search/sort/detail; một phần cũng chịu gate và count |
| Danh sách lớp sinh viên | 678.130 | 99.725 | 199.450 | DISTINCT(TRIM) quét ~19.945 rows/lần, chỉ trả ~814 nhãn |
| Dự báo exact ranking | 209.560 | 125.736 | 94.302 | Khoảng 10.478 rows/lần cho ba scope |
| Học bổng | 210.950 | 103.580 | 4 | Đã có snapshot/index và cache aggregate có publication fence |
| Push subscriptions/attempts | 170.520 | 906 | 353 | Fanout có read amplification, nhưng không giải thích đột biến hiện tại |
| Lookup quyền xem candidate banner | 99.050 | 48.133 | 53.594 | Lookup image_url miss quét bảng khi thiếu index |
| Lookup conversation owner | 90.800 | 40 | 4.566 | Chưa có index bắt đầu bằng conversation_id cho query này |
| Probe schema công bố | 4.320 | 47.327 | 70.776 | LEFT JOIN receipts ON 0 vẫn tạo SCAN l |

¹ Phân loại suy luận theo SQL, không xác nhận caller: snapshot HK2, group/count catalogue, đọc toàn bộ schedules/snapshots và atomic import guards. Các guard này cần dữ liệu mới nhất. Không cache hay bớt checks để giảm quota. Các nhóm còn lại và phần chưa phân bổ được giữ trong JSON, không cộng lẫn vào bảng trên.

### 1. Gate HK2 và facets

`EXPLAIN` production cho thấy scalar count subqueries trong `verifiedOpenSql`, scan ledger có sắp xếp và `SCAN l LEFT-JOIN` trong probe. Benchmark runtime xác nhận SQLite có thể chạy hai count **trước khi loại p.state=CLOSED**: một query facet với 2.357 official rows đọc 7.074 rows nhưng trả rỗng. Đây là chi phí thực, không chỉ suy luận từ plan.

Triển khai `CASE WHEN EXISTS(state=OPEN theo PK) THEN <verifiedOpenSql nguyên vẹn> ELSE 0 END`. CASE của SQLite đánh giá nhánh theo cách lazy; gate vẫn nằm trong từng catalogue SQL statement. Không cache OPEN boolean. Khi OPEN vẫn kiểm tra đầy đủ manifest/payload SHA, revision, receipt, owner, backup/release, ledger JSON và hai official counts. Không sửa importer, receipt chain, operator approval, schema chuẩn hay điều kiện mở. [Ngữ nghĩa CASE của SQLite](https://www.sqlite.org/lang_expr.html#the_case_expression).

Đổi join không bao giờ khớp từ `ON 0` sang `ON l.actor_scope = NULL`. Equality với NULL vẫn không bao giờ TRUE, nhưng cung cấp search key cho composite PK. Các cột trong schema vẫn được SQL compiler kiểm tra; schema thiếu vẫn CLOSED. Probe giảm từ 1.096 xuống 1 row với 1.095 receipts.

Trong `filterOptions`, gộp các scope có **cùng WHERE và bindings**, chỉ trong request. Đọc các cột nhãn một lần cho mỗi scope, rồi dùng lại chính các phép Set, sort tiếng Việt, trim và parse group hiện có. Bỏ GROUP BY/MIN/ORDER intermediates vốn không đi vào response đã sort. Giữ cơ chế tự loại bộ lọc của từng facet. Không dùng cache liên request: mutation hoặc đóng gate có hiệu lực ở request kế tiếp.

Chi phí còn lại: name-sort vẫn thu thập ID rồi sort tiếng Việt để bảo toàn thứ tự; OFFSET và substring LIKE vẫn đọc nhiều ở scope rộng. Không thay bằng NOCASE, prefix search hay bỏ count vì sẽ đổi kết quả. Không thêm index vào course/ledger/facets: importer hiện pin schema byte-for-byte, và index như vậy sẽ làm kiểm tra an toàn báo drift.

### 2. Directory và index bổ sung

Index riêng trên TRIM chưa đủ: benchmark vẫn 20.814 rows. Truy vấn mới dùng recursive MIN seek trên expression index để đi qua mỗi **nhãn phân biệt**, thay vì mỗi sinh viên. BINARY giữ DISTINCT phân biệt hoa/thường; ORDER BY NOCASE giữ ordering đã khai báo; TRIM và lọc độ dài vẫn như cũ. Các nhãn bằng nhau theo NOCASE vốn không có tie-break được SQL cam kết; membership được kiểm tra cả case variants, dấu tiếng Việt, tab, blank và NULL.

Migration `0063_d1_read_indexes.sql` chỉ tạo ba index trên directory, event_candidates và ai_chat_logs, không đụng schema HK2 đã pin. `INDEXED BY` ngăn vô tình chạy recursive full scans khi index thiếu; code fallback chính query DISTINCT cũ nếu migration chưa có. Index cập nhật tự động theo insert/update/delete; không cache dữ liệu sinh viên hay quyết định xác thực.

Index tạo một lần có chi phí rows_written và storage theo số bản ghi đủ điều kiện. Cần chạy migration ở cửa sổ riêng nếu sau này được phê duyệt; chưa thực hiện tại đây. Không có dependency/package hoặc security setting thay đổi.

### 3. Push, cron, queues và caching

- `push-delivery.ts` đã có index subscriptions theo updated_at/id, PK delivery theo source/subscription, index failed retry, batch persist từng 10 thiết bị, tối đa 100 thiết bị + lookahead. Mỗi continuation vẫn bắt đầu từ đầu subscriptions và anti-join terminal attempts: với N thiết bị, kích thước B, có thể gần O(N²/B) đọc trong fanout lớn. Không dùng cursor đơn giản vì updated_at có thể đổi, subscription mới có thể xuất hiện và failed targets phải giữ backoff. Đây là cơ hội tối ưu riêng với snapshot/cursor semantics rõ ràng; không sửa retry/dedupe trong PR này. 51 regressions có các trường hợp stale, skipped, concurrent claim, duplicate message, multi-device và 965-subscription continuation.
- Cron trong config: crawler `*/15` (96 lần/ngày, mỗi lần fanout theo nguồn), recovery push `7 *` (24), maintenance `37 19 *` (1). Public code còn nhận các cron legacy nhưng chúng không nằm trong config hiện tại. Course scraper cron và Supabase→D1 course sync đều đang tắt theo config; không quy toàn bộ course reads cho cron.
- Crawler đã dùng indexed link/title dedupe, no-op mutation guards và chỉ tạo outbox khi có nội dung mới. Recovery có claim lease; Queue continuation là message mới, retry dành cho lỗi. Không tăng/giảm tần suất hoặc tắt jobs vì thay đổi độ trễ và hành vi nghiệp vụ.
- Public edge cache vẫn giữ nguyên allowlist/query key/Origin, bypass no-cache và TTL. Unscoped/HK2/detail requests tiếp tục no-store; không mở cache HK2. Học bổng vẫn kiểm tra publication trước và sau aggregate cache, revision/snapshot scoped, TTL 30s; không dùng cache cho policy hay danh tính.

### 4. Polling, Auth, scholarships và rankings

Đã kiểm tra polling: tickets 30s, ticket messages 15s đều dừng khi tab hidden; user role refresh 60s và focus/online/visibility; admin announcements 8s khi visible; AI ingestion status cũng poll khi xử lý. Không có course-list interval tương ứng với hàng triệu rows; volume chủ yếu bị nhân tại backend khi filter requests chạy. Không sửa hook/components vì yêu cầu giữ UI và freshness nghiệp vụ; không tính tiết kiệm polling giả định vào kết quả.

Auth database chỉ chiếm 35.706–107.036 rows/ngày nhưng lỗi chung account vẫn làm Auth hỏng. Query login UNION/index đã được tối ưu trước PR này; không cache session/role, bỏ verification hoặc thay cấu hình bảo mật.

Scholarships đã có precomputed approved snapshots, granular aggregate cache/coalescing và seek cho facets ít giá trị. Test hiện có tái lập 13.418→3.167 rows cold và 13.418→4 warm so với baseline cũ của tính năng; đó **không phải savings của PR này**. Giữ nguyên publication fence và private lookups.

Imported ranking đang gộp ba scope trong một semester scan để giữ comparator GPA, training score, credits và NULL/REAL chính xác. Thay bằng legacy score key/official rank/rounded buckets sẽ đổi kết quả. Giữ nguyên; các aggregate COUNT/SUM cần scan hiện là phần nền ~0,09–0,21 triệu/ngày. Các exact own lookups đã dựa trên PK. Nếu phần nền này tăng mạnh, cần materialization có revision và golden equivalence riêng.

## Benchmark tái lập

So sánh API thực trên cùng Miniflare D1 local với code baseline Git `eaa2a55`; không dùng mock rows_read hay suy từ milliseconds. Counter gồm `meta.rows_read` của cả prepare và batch, kể cả probe schema và index reads. Fixture tổng 4.497 course rows (2.357 official HK2, 2.100 HK1, 40 user-added), retired rows, NULL is_user_added, 1.095 receipts. Các schema/index/trigger course lấy từ artifact schema production đã có sẵn trong repo; không export dữ liệu production mới.

| Workload / request | Trước | Sau | Giảm |
|---|---:|---:|---:|
| Facets không lọc, CLOSED | 50.548 | 4.079 | 91,9% |
| Facets HK2, CLOSED | 36.802 | 2.399 | 93,5% |
| Facets HK1, CLOSED | 14.900 | 1.682 | 88,7% |
| Facets HK2 + major, CLOSED | 36.666 | 4.797 | 86,9% |
| Facets không lọc, OPEN | 64.741 | 11.747 | 81,9% |
| Facets HK2, OPEN | 51.301 | 10.067 | 80,4% |
| Facets HK2 + major, OPEN | 45.130 | 20.132 | 55,4% |
| Nhiều filter + phase, OPEN | 48.273 | 46.982 | 2,7% |
| Schema probe / 1.095 receipts | 1.096 | 1 | 99,9% |
| Directory / 20.000 students, 814 nhãn | 20.814 | 2.445 | 88,3% |
| Banner miss / 10.000 candidates | 10.000 | 0 | 100% |
| Conversation owner / 10.000 chat rows | 9.999 | 1 | >99,9% |

Gộp scope giảm facet requests phổ biến từ 5 xuống 2 SQL gồm probe. Scope nhiều filter khác nhau có thể vẫn cần 5 SQL và phải chạy gate OPEN nhiều lần. Không suy rộng mức giảm 90% cho tất cả request. [Toàn bộ case counters](benchmarks/d1-audit-local.json).

```powershell
$env:D1_AUDIT_REPORT='docs/benchmarks/d1-audit-local.json'
node --test --experimental-strip-types tests/d1-quota-audit.test.mjs
node scripts/audit-d1-inventory.mjs
node scripts/summarize-d1-audit.mjs
npm run test:hk2-import
npm run typecheck
npm run cf:typecheck
```

Checkout cần Git history có `eaa2a55` và dependencies từ lockfile. Linux/CI dùng `D1_AUDIT_REPORT=... node ...`. Benchmark test bao gồm payload equivalence CLOSED/OPEN, multi-value/self-excluded facets, search, suggestions, pagination, Vietnamese sort, group expansion và detail; tampering ledger/count/visibility/receipt và reuse wrapper sau đóng gate; directory authorization, live changes, empty table và fallback thiếu index; index không làm đổi HK2 schema. Bộ test công bố hiện có kiểm tra toàn bộ 95 batches, owner approval, race, rollback/reimport, cache poisoning và snapshots.

## Mục tiêu vận hành 3 triệu/ngày

Chưa đo được production sau tối ưu vì **chưa deploy**. Dưới đây là sensitivity có thể tính lại bằng script; giữ nguyên mọi read ngoài facets/directory, cộng cả Auth, không lấy credit từ index banner/chat hoặc probe:

| Phần facet rows còn lại | 20/11 | 21/11 | 22/11 |
|---|---:|---:|---:|
| 15% | 4.347.638 | 4.292.601 | 2.197.942 |
| 25% | 4.571.332 | 4.710.223 | 2.703.902 |
| 35% | 4.795.026 | 5.127.845 | 3.209.863 |

Với cơ cấu ngày 22/11, mục tiêu dưới 3 triệu khả thi nếu facet tổng hợp còn dưới khoảng 30,9% hiện tại. Các case phổ biến đo được tốt hơn ngưỡng này; các scope nhiều filter khi OPEN có thể không đạt. Vì thiếu bound values/request mix, đây là **điều kiện khả thi**, không phải dự báo đã xác nhận. Không đủ bằng chứng đảm bảo dưới 3 triệu cho tải ngày 20/21 chỉ với PR này; riêng snapshot/import ngày 21 là 2,22 triệu. Nếu loại các thao tác audit/import một lần khỏi tải vận hành thì cần bằng chứng caller/logs để tính lại, không tự động loại trong báo cáo.

Sau khi có phê duyệt triển khai riêng, tiêu chí nghiệm thu nên là ba ngày UTC đủ 24 giờ: toàn account <3 triệu rows/ngày, cùng traffic/resource mix, không errors quota, payload parity, gate HK2 fail-closed và hiệu quả rows/request cho scope thực. Đặc biệt theo dõi ngày có import, OPEN HK2, cold isolates và fanout lớn. Không đề xuất nới bảo vệ HK2 hoặc thay security để đạt con số.

## Validation

- Benchmark/quota regressions mới: 3 tests pass; counters trong artifact.
- Các regressions course authority, directory, push/retry/cron, exact rankings và scholarship facets: 51 tests pass.
- Bộ công bố HK2 trực tiếp: 4 tests pass, gồm full opening/rollback/tampering và warm-cache leak checks.
- Frontend typecheck và Worker typecheck: pass.
- Toàn bộ `test:hk2-import` và CI GitHub: đang ghi nhận ở Draft PR; xem checks theo commit hiện tại. Workflow D1 mới chỉ dùng local Miniflare, không có credential/deploy step.
