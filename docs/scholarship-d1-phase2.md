# Scholarship D1 Phase 2

## Phạm vi và bằng chứng

Base `origin/main`: `cc7c8222d7c039912bb6b882b0ea5372cb645c6e`.
Chỉ thay đổi public Scholarship reads và cache aggregate trong isolate.
Không migration, deploy, SQL production, Auth Worker, release guards, billing,
rate limit hoặc quyền truy cập. Snapshot rows và Admin transitions không đổi.

Đã đọc report incident V2, README evidence, raw Query Insights/module attribution,
Phase 1 source và tests. Bản trích SQL không có bound parameters và SHA-256 của
hai artifact nguồn được lưu tại
`docs/benchmarks/scholarship-d1-phase2-production-input.json`.
Report/evidence đầy đủ vẫn được giữ nguyên trong workspace điều tra của Owner.

Production 18/10/2026 UTC: Row Metrics account 5.135.215/5.000.000 reads,
Public 5.095.389; dataset Query Insights riêng ghi Scholarship 3.121.000,
CTE facets mới 2.155.379/1.964 executions, count/stats 582.605 và recipient pages
259.733 reads. Không trộn totals của hai dataset. Production đã chuyển sang
Phase 1; chưa có telemetry cache hit/miss hoặc Rows Read/HTTP request.

Source xác nhận DISTINCT/count vẫn đọc các index entries trùng label; Phase 1
không single-flight, khóa cả tổ hợp filters và chưa chia sẻ count với recipient
pages. Local D1 xác nhận chi phí scan này và lợi ích của thay đổi bên dưới.
Không suy ra production có bao nhiêu concurrent misses từ source/benchmark.

## Các phương án

| Phương án | Đánh giá và quyết định |
| --- | --- |
| Phase 1 | Oracle được bundle từ đúng base Git, bao gồm bản cache của base; không vô tình dùng cache Phase 2 cho baseline. |
| Chỉ single-flight | Giảm aggregate SQL trùng khi cùng isolate/binding và cùng key; không hạ chi phí cold request đơn lẻ. Chọn làm một phần của Phase 2. |
| Tăng TTL/cache lớn | Không giải quyết chi phí cold scans; hit rate production chưa biết. Giữ TTL 30 giây và trần serialized key/value 1.000.000 characters. |
| Bounded index seeks + scoped reuse/count sharing | Giảm cold scan cho các facet ít label bằng index hiện có; giữ DISTINCT cho filters/search/high cardinality. Không schema change. Chọn triển khai. |
| Precomputed normalized facet labels | Local experiment đo build reads/writes và read lower bound, đối chiếu đúng unfiltered options/count/page. Có thêm chi phí storage, publication consistency và migration; không giải quyết mọi tổ hợp filters. Chỉ thiết kế, không cần cho bản PR này. |
| Gộp mọi facet thành JSON array không giới hạn | Không chọn: dữ liệu nhiều label sẽ buffer toàn bộ kết quả; phải giữ bounded page và BINARY order. |
| Cache recipient rows/private detail hoặc bỏ publication gates | Không chọn; không thuộc quyền hạn/correctness contract. |

## Query và cache

`scholarship-facet-query.ts` dùng recursive MIN để tìm tối đa 16 label khác nhau
qua các index `(batch_id, facet_column)` đã có trong 0057/0059. Mỗi seek giữ
JOIN campaign với slug, status, approval, active batch và revision. Nếu gặp
label thứ 16, SQL chọn DISTINCT của Phase 1 thay vì tiếp tục recursion.
Probe không chạy khi có search/remaining filters, total <1.024, hoặc cache đã
cho biết facet có >=16 label. Query trả exact count và page tối đa 200 options,
bao gồm page rỗng/out of range. SQL giữ `COLLATE BINARY`; không chuyển sorting
Unicode sang JavaScript. NULL/empty bị loại như cũ.

Count được dùng chung giữa facets, recipients và search khi normalized query,
filters, DB và publication scope hoàn toàn trùng nhau. Recipient payload luôn
đọc mới từ D1; không lưu row, tên, MSSV, scores, rankings hay session trong
aggregate values. Summary `COUNT(DISTINCT student_code)`/award aggregates vẫn
giữ nguyên: chưa có bằng chứng để thay bằng row count hoặc expected_rows.

Một facet dùng key loại bỏ chính filter mà SQL self-exclude. Việc đổi `major`
có thể dùng lại facet major; các facet khác vẫn áp dụng major và có key khác.
Các page cùng facet merge sau final fence để concurrent page completion không
làm mất page đã tính. TTL không kéo dài khi put lại.

Key chứa DB binding identity (WeakMap), slug, active batch, revision, nguyên
văn approved fields/mapping, source checksum, approval document, normalized q
và sorted filters. Search/filter strings chỉ ở RAM, không log/persist/export.
Không dùng cache để quyết định quyền. Mỗi caller, kể cả follower của
single-flight và recipient count hit, tự chạy selectCampaign trước và sau
asynchronous work; revoke =>404, policy/batch/revision/checksum đổi =>409.
Chỉ put aggregate sau khi caller qua final fence. Final read là linearization
point; một lần unpublish xảy ra sau đó không thể thu hồi response đã được cho
phép. Không có HTTP/CDN result cache; response no-store giữ nguyên.

Single-flight chia sẻ JSON data, không share D1 statement/Response/stream hay
authorization result. Initiator await công việc của nó; waiter await data rồi
tự chạy fence trong request context riêng. Promise reject được cleanup; lỗi
không cache. Test workerd dispatchFetch xác minh các request độc lập thực sự
join và không gặp lỗi cross-request I/O. Test thêm 100ms delay trước local count để bảo đảm HTTP requests overlap;
code production không có delay này. Nếu một facet lỗi, initiator vẫn đợi
mọi facet settle trước khi trả lỗi để không kết thúc context khi follower
còn chờ. Không có promise chạy nền sau response.
Không đảm bảo coalesce xuyên isolate/PoP hoặc khi binding identity đổi.

Cache có tối đa 224 aggregate entries (32 x bảy aggregate của Phase 1), vẫn
giới hạn 1.000.000 serialized key/value characters. Đây không phải 224 response
snapshots. In-flight tracking tối đa 32 keys và 1.000.000 key characters; đầy
thì request tự query, không tạo queue/retry. Entry expiry/eviction/failure chỉ
mất lợi ích performance. Các giới hạn này không phải phép đo heap: runtime
objects, JSON copies và query buffers có overhead; benchmark kiểm tra bounds
của cache/tracking, không tuyên bố peak Worker heap được đo.

## Benchmark tái lập

```
npm ci --ignore-scripts
npm run test:scholarships:performance
```

Golden tests cần Git objects `cc7c822…` (Phase 1 baseline) và `a746e7f…`
(oracle trước Phase 1). CI hiện có `fetch-depth: 0`; PR không đổi workflow và
test không tự fetch network để che thiếu baseline.

Chỉ Miniflare/D1 local in-memory, không remote binding hay dữ liệu sinh viên.
Runtime/versions, dataset sizes, SQL, rows_read/written, cache hit/miss/join
và bounds nằm trong `docs/benchmarks/scholarship-d1-phase2.json`.
Hit/miss/join trong artifact đếm từng aggregate lookup, không phải HTTP cache
hit rate. Counters không được trả bởi production API hoặc log query parameters.
Raw output tái tạo tại `.cache/phase2/benchmark.json`; full validation logs local
ở `.cache/phase2/`. Bản report validation ghi hashes để kiểm chứng.

Fixture 13/128/1.060/10.000 rows có sáu dimension, NULL/empty, tiếng Việt, search
prefix, wildcard escaping, source order và private columns không được xuất.
Fixture high cardinality có 1.060 class labels; ALL_HIGH có 1.024 rows và tất cả dimension
độ phân tán cao. Đây là dữ liệu synthetic, không phải distribution production;
1.060 row được chọn để đối chiếu average unfiltered count trong Insights.

Các scenario: cold, warm, continuation, recipient-after-facets, self-excluding
reuse, tám same-key/different-key requests, nhiều key đến eviction; oracle 64
filter masks, page limits/deep pages, Unicode/NFD, numeric q, zero matches.
SQL/Rows Read bao gồm cả publication gates; seed/admin/local precompute setup
writes được tách khỏi request costs. Mọi measured API request phải writes=0.
Không normalize/tự đặt hệ số extrapolate sang production reads/ngày.

| Fixture | Rows | Cold Phase 1 reads | Cold Phase 2 reads | Reduction |
| --- | ---: | ---: | ---: | ---: |
| SMALL | 13 | 158 | 158 | 0.00% |
| MEDIUM | 128 | 997 | 997 | 0.00% |
| PRODUCTION_SIZE | 1060 | 8151 | 3167 | 61.15% |
| LARGE | 10000 | 70043 | 21047 | 69.95% |
| HIGH | 1060 | 10581 | 5597 | 47.10% |
| ALL_HIGH | 1024 | 25119 | 25707 | -2.34% |

Fixture 1.060 rows (all request writes=0):

| Scenario | SQL Phase 1 / Phase 2 | Reads Phase 1 / Phase 2 | Reduction |
| --- | --- | --- | ---: |
| cold | 9 / 9 | 8151 / 3167 | 61.15% |
| warm | 2 / 2 | 4 / 4 | 0.00% |
| continuation | 3 / 3 | 1815 / 1815 | 0.00% |
| recipient-after-facets | 3 / 3 | 1084 / 25 | 97.69% |
| cold-recipient | 3 / 4 | 1084 / 1086 | -0.18% |
| warm-recipient | 3 / 3 | 1084 / 25 | 97.69% |
| self-excluding-reuse | 9 / 8 | 6844 / 5846 | 14.58% |
| concurrent-same-key-8 | 72 / 23 | 65208 / 3195 | 95.10% |
| concurrent-different-key-8 | 72 / 65 | 56440 / 43763 | 22.46% |

Precompute local-only: build 7340 reads / 535 writes (7 SQL, DDL excluded); unfiltered request lower bound 1078 reads / 9 SQL. Đây là lower bound chưa có production publication metadata/CAS integration.


Cold recipient/search chưa có count cache tốn thêm một publication read so với
Phase 1 để fence cache insertion/response; bảng cold recipient trong artifact
được đo riêng. Filter/search cold paths có thể giữ nguyên scan cost. High
cardinality cold facets trả thêm bounded probe overhead; regression budget
trong fixture là <=3%, không hứa mọi distribution đều tốt hơn. Continuation
của facet đã biết cardinality cao bỏ probe. Warm facets vẫn hai gates/4 reads.

## Thiết kế migration riêng — chưa triển khai

Thí nghiệm tạo tables `phase2_precompute`/`phase2_precompute_total` trong synthetic Miniflare để đo
lower bound của materialized-label reads. Đây không phải migration candidate
đủ security để release: table thử nghiệm chỉ có một batch, chưa có metadata
publication/policy. Read experiment đo exact precomputed count + hai policy gates và sáu
bounded facet queries; chưa tính cost metadata/invalidation production.

Nếu Owner chọn giai đoạn sau, cần proposal/migration/tests riêng:

1. Table labels/counts keyed batch + publication revision + policy digest +
   facet/value, index hỗ trợ exact BINARY page. Chỉ approved public dimensions.
   Không chứa recipient identity/private fields, không precompute Cartesian
   product của filter combinations.
2. Validate immutable applied batch, approved fields, checksum, document và
   expected publication CAS; build và activate version atomically qua publish
   transaction. Không dùng unreviewed preview values làm public aggregate.
3. Read vẫn fresh publication gates và policy/version match, fail closed khi
   missing/incomplete; filtered/search scopes fallback SQL exact hiện hành.
   Unpublish/revoke/batch replacement/rollback không được dùng version cũ.
4. Separate additive migration, corruption/partial-build/CAS rollback tests,
   immutable triggers, index plans, storage/write budget và Owner rollout.
   Không sửa release guard hoặc tự chạy migration remote trong PR hiện tại.

No-migration candidate đã nhắm cả cold reads và duplicated concurrent/count
work. Chưa cần nhận thêm publication/schema complexity để đạt lợi ích local
đã đo. Local precompute benefit không chứng minh cần triển khai production.

## Security, validation và rollout

Giữ nguyên campaign visibility, publication approval, immutable snapshot
triggers/Admin state machine, approved public projection và private API auth.
Tests Phase 1 vẫn kiểm tra DB/campaign isolation, no-revision field revocation,
missing document, revision race, actual approve/publish/unpublish/replacement/
rollback, private boundaries và rate limiter trước SQL. Phase 2 thêm mọi
single-flight waiter bị revoke, recipient count hit bị policy race, error
cleanup, mutable-copy isolation, TTL/entry/byte limits và workerd concurrency.

| Check | Result |
| --- | --- |
| Full npm test | PASS, 1276 reported tests, zero failures/cancellations |
| Golden/publication/security | PASS, original Phase 1 protections + Phase 2 races, error drain and Unicode probe boundaries |
| Scholarship browser suite | PASS, 2 browser tests, five list viewport sizes + private-page auth/responsiveness |
| Frontend/Worker typecheck | PASS |
| cf:types:check | PASS |
| Build | PASS |
| Worker deploy --dry-run | PASS, no upload/deploy |
| Benchmark regression | PASS, all measured API writes=0, same outputs, <=3% high-cardinality cold regression budget |
| git diff --check | PASS |

Log/source SHA-256 và các lần test ban đầu cần sửa được ghi trong benchmark JSON. Các log local không được commit; không có secret hoặc dữ liệu sinh viên trong artifact benchmark.

Rollback: revert ba production Scholarship files và accompanying tests/docs.
Không data rewrite, migration hay cache purge ngoài isolate RAM. Không merge
hoặc deploy trong task này. Owner review và release approval còn riêng biệt.

Sau release được duyệt, cần cùng UTC windows + deploy annotation, route-level
SQL/rows/request và bounded cache outcomes không có params/PII, tổng account
Rows Read/traffic, error/login outcomes. Giữ Row Metrics và Insights riêng.
Hiệu quả production và tình trạng incident sau Phase 2: **NOT_VERIFIED**.
