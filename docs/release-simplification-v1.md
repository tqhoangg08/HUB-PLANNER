# HUB Release Assistant V1

## Phạm vi và trạng thái thực tế

CLI local cho Solo Owner, không sửa workflow production, approval guard, live-state guard,
Auth Worker, Scholarship, migrations hay branch/environment settings. Không auto-deploy
trên push/merge. Không dùng CI thành production approval.

Read-only audit ngày 2026-10-18 (Asia/Saigon):

- Fetch và GitHub API đều trả main `6a4970df8484aa6154035d506fe98077f2c21a9d`.
- Release thành công mới nhất: [39087831056](https://github.com/tqhoangg08/HUB-PLANNER/actions/runs/39087831056), exact SHA trên, attempt 1.
- Job `117558498747`: preflight `8869278a-e66b-4edb-84a0-5c653e64e2db`,
  `PUBLIC_ONLY_SOLO_OWNER_APPROVAL=PASS`, deploy và postflight
  `e17bfe9f-5aa8-45e8-88fe-9fc63c26b2a3` PASS.
- Public environment metadata: wait 5 phút, bypass OFF, custom branch policy;
  main protected. Classic protection không đọc được bằng credential terminal hiện có.
- Cloudflare credential local trả 401: **live Worker, traffic, bindings và schema hiện
  tại chưa được xác minh lại trong lần triển khai tooling này**. Log postflight là
  bằng chứng lịch sử, không thay thế live API. CLI sẽ block khi thiếu credential.
- Main còn pin `8869278a…`. Không sửa pin trong PR tooling. Owner phải chạy baseline
  helper với live credentials, review/merge baseline PR riêng trước release tiếp theo.

## Quy trình cũ và mới; cách đếm thao tác

Chỉ đếm hành động Owner, không đếm thời gian chờ; không gộp command và typed
confirmation thành một thao tác. Setup credential một lần được tách riêng.

| Release | Trước | V1 |
| --- | --- | --- |
| Independent validation | Tự chọn main, chạy CI và kiểm tra | Tự kiểm tra exact SHA; nếu thiếu, xin xác nhận validation-only rồi chờ |
| SHA | Tự lấy/copy SHA | Fetch + API + checkout phải trùng SHA |
| Dispatch | Tự điền SHA và Public-only approval | `release:prepare`, xem summary, nhập `RELEASE <sha>` |
| Run ID | Tự tìm/copy | Tự tìm duy nhất run mới sau dispatch |
| Xác nhận lần hai | Sửa riêng SHA và Run ID variables | `release:approve`, xem lại, nhập `APPROVE <run-id> <sha>` |
| Kết quả | Mở run và kiểm tra | Theo dõi run, live postflight, provenance và URL |

Trước: **6 thao tác release** (run CI, copy SHA, dispatch, copy Run ID, edit SHA,
edit Run ID). V1: **4 thao tác khi CI đã có** (2 commands + 2 confirmations).
Nếu thiếu CI: **5 thao tác, 3 confirmations tổng cộng**, trong đó một là chạy
validation không deploy; luôn có đúng 2 production confirmations độc lập.
Manual fallback vẫn cần sửa 2 variables trong GitHub. V1 hướng đến hai xác nhận,
không tuyên bố mọi tình huống chỉ cần hai click.

Baseline là công việc review riêng: trước phải thu thập version/bằng chứng, sửa
pin/test, chuẩn bị PR; nay một command chuẩn bị source/test/evidence/PR body.
Tests, commit/push, Owner review và protected merge của baseline PR vẫn cần thiết.
V1 không tự merge hoặc dispatch sau merge. Không có thay đổi high-risk guard cần
chứng minh security equivalence: pin và tất cả production guards giữ nguyên byte.

## Windows quick start

Yêu cầu Node 22.15+ (như repo), npm, Git; PowerShell 7 hoặc Windows PowerShell 5.1.
Scripts dùng Node và `execFileSync` với argument arrays; không Bash, `curl`, jq,
shell interpolation, shell token arguments hoặc cài gh tự động.

```powershell
git fetch origin main
git switch main
git pull --ff-only origin main
npm ci --ignore-scripts
node scripts/release-assistant.mjs --help
npm run release:prepare
npm run release:approve
npm run release:status
```

Checkout phải sạch, kể cả untracked files, và HEAD phải bằng fetched origin/main.
Các commands fetch/đọc GitHub lại; không dùng SHA/run ID do người dùng nhập tùy ý.
Trước release hiện tại cần baseline PR riêng do pin cũ (xem phần dưới).

Authentication dùng Owner `GH_TOKEN` / `GITHUB_TOKEN` đã có trong process, hoặc
`gh auth token --hostname github.com` từ đăng nhập Owner hiện có. Token chỉ ở memory;
không in, ghi receipt, truyền argv, commit hay đưa vào Actions. Không paste token
vào chat/command history. Dùng credential manager/secret injection đã được Owner
duyệt. Không có token/gh: block với hướng dẫn, không anonymous fallback cho release.

Local principal phải là đúng numeric Owner ID của repository. Cần đọc repository,
branch/classic protection (Administration read), environments/policies/variables,
Checks và Actions/jobs/logs; prepare cần Actions write để dispatch. Approve tự động
cần Environments write để PATCH đúng hai **existing variables**. CLI không tạo token,
tăng quyền, sửa protections hoặc tạo missing variables. Fine-grained PAT hiện có của
workflow chỉ đọc metadata không đủ cho việc này. Không giả định PAT có Checks grant;
chỉ dùng credential local đã có khả năng thực tế (chẳng hạn Owner gh OAuth). API
403, thiếu Checks hoặc thiếu quyền đọc protection đều block, không thay Check Runs
bằng commit statuses. Giữ nguyên split credentials và read-only PAT trong workflow.

Cloudflare cần `CLOUDFLARE_API_TOKEN` đã được Owner cấp cho việc đọc Public Worker,
deployments/versions/settings và D1 schema/ledger đúng account/database cố định.
Không dùng token deploy của Actions, không tự lấy/refresh Wrangler OAuth, không
chạy migration. SQL POST của guard chỉ là các PRAGMA/SELECT cố định.

## Hai confirmations và bằng chứng

1. Prepare fetch/API/clean checkout, Owner, classic main protection, environment,
   latest exact-SHA Actions check + successful manual independent validation run.
   Missing CI chỉ dispatch validation-only sau typed consent, rồi chờ tối đa 45 phút.
2. Gọi nguyên `checkPublicReleaseState(..., predeploy)`: pin chính xác, một version
   100% traffic, settings **và serving bindings**, observability, schema/ledger,
   publication/immutability triggers và Scholarship limiter. Đối chiếu version với
   log postflight của newest successful Owner release, exact SHA ancestor main,
   đúng job/run, thời gian tạo version/deployment nằm trong job thành công.
3. Summary: Owner ID, commit, compare URL, exact SHA, CI URL, Public Worker/version,
   traffic/schema PASS, environment/policy fingerprint. Typed confirmation 1.
4. Recheck checkout, main, Owner, CI, protection fingerprint và live version ngay
   trước POST. Ghi durable dispatch intent trước POST, tìm duy nhất run mới.
5. Approve lấy run từ receipt, recheck tất cả; attempt 1, main SHA không đổi,
   không concurrent release, không replay, run dưới 24 giờ, sau thời điểm intent.
   Nếu chưa đủ timer, chỉ chờ/read; tối đa 45 phút. Actual GitHub wait timer vẫn
   do environment thực thi, CLI không approve/bypass pending deployments API.
6. Khi hợp lệ, summary lần nữa, typed confirmation 2 gắn SHA **và Run ID**.
   Recheck sau prompt; ghi durable `approving` trước PATCH SHA; recheck toàn bộ
   trước PATCH Run ID. Read back values/timestamps và dùng nguyên
   `validateReleaseApproval` xác minh. Workflow final gate vẫn quyết định deploy.
7. Monitor (tối đa 60 phút); success chưa đủ: live postflight và exact run/version
   provenance phải PASS. `release:status` resume monitoring mà không gửi lại approval.

SHA thay đổi ở bất cứ chỗ nào: dừng. Race sau local recheck vẫn bị workflow exact
main/final guard chặn; CLI không thay guard bằng local receipt. Không có distributed
transaction giữa API reads/PATCHes: hai variables không thể update atomically.
Partial/ambiguous update block, không rollback variable về giá trị cũ hoặc tự retry.
Local policy fingerprint giữ cả environment identity/rules và classic protection;
thay đổi hợp lệ nhưng khác snapshot cũng yêu cầu quy trình release mới.

## Manual fallback, failures và recovery

Nếu Owner không có quyền local PATCH (nhưng có đủ quyền đọc bằng chứng):

```powershell
npm run release:approve -- --manual
```

CLI vẫn kiểm tra và xin confirmation 2, sau đó in environment URL và exact hai
giá trị không secret. Owner sửa **cả hai existing variables** trong GitHub lúc đó,
đảm bảo timestamp mới hơn dispatch, trong khi validation/wait chưa chạy release job.
Không sửa protection/timer. Chạy `release:status` để theo dõi và postflight.
Nếu đã thử auto-PATCH nhưng lỗi/timeout: đọc run/variables trực tiếp, không chạy lại
approval mù; manual fallback chỉ được thực hiện sau Owner đối chiếu lại toàn bộ
evidence, run còn hợp lệ và chưa vào final gate. Khi không chứng minh được, cancel
run và bắt đầu release mới. CLI không tự cancel production.

| Failure | Xử lý fail-closed |
| --- | --- |
| Owner từ chối / stdin không interactive | Không dispatch/PATCH; không có `--yes` |
| SHA/CI/policy/version/schema drift | Block trước writes; workflow vẫn có final guards |
| Wrong Owner, run ID, rerun, replay, run cũ | Block; không adopt một run tùy ý |
| Concurrent release | Block kể cả queued/waiting/validating; GitHub concurrency giữ nguyên |
| API timeout/403/malformed/pagination thiếu | Block; không retry write, anonymous fallback hoặc log response body |
| Dispatch timeout / chưa xác định run ID | Giữ `dispatching`; xem GitHub Actions, không redispatch |
| Partial PATCH / read-back không đúng timestamp | Giữ `approving`; kiểm tra manual, không replay |
| Release job đã bắt đầu / release failed | Không approval muộn; Owner review/rollback riêng |
| Log hết retention / unknown version / later rollback / split traffic | Không tạo baseline |

State/lock nằm trong `<git-common-dir>/hub-release-assistant`, dùng chung tất cả
worktrees; không lưu secrets. Exclusive lock giữ trong command để chống hai local
processes; remote concurrent run còn được kiểm tra bằng API. Sau crash, xem PID/run
và chắc chắn không còn process thao tác trước khi xóa **đúng file lock**. Receipt
không được tự xóa khi trạng thái chưa rõ. Sau khi Owner đã cancel/đối chiếu run,
có thể archive receipt để bắt đầu lại; không có force/reset command bỏ guard.
Completed receipt được archive tự động ở prepare tiếp theo. Các variables cũ không
được tự xóa; run-ID binding và freshness chặn reuse, CLI từ chối replay.

## Baseline PR automation

```powershell
# clean exact origin/main checkout, không có active release
npm run release:baseline
git diff
npm run test:release-assistant
npm test
npm run typecheck
npm run cf:typecheck
npm run build
git diff --check
# review; commit/push và mở PR theo hướng dẫn CLI
```

Tự đọc serving version, postflight/schema/bindings và GitHub evidence; so newest
**successful Public-only release**, Owner identity, attempt 1, historical exact SHA
ancestor main, release-public job SHA/run, postflight log version và timestamps.
Read lại main/protections/live state trước khi tạo branch local
`codex/release-baseline-<run-id>`. Unknown/latest upload không được chấp nhận.
Rollback deployment xảy ra sau successful job không được chấp nhận chỉ vì trùng
version. 100% là một version duy nhất, không phải tổng traffic nhiều version.

Helper chỉ sửa pin trong `check-public-release-state.mjs`, assertion reviewed pin
trong existing negative suite; ghi `docs/public-release-baseline-evidence.json`
và PR body trong git state directory. Không bỏ hoặc đổi logic của drift/schema guards.
PR body được chuẩn bị; commit/push/open PR và merge vẫn là Owner workflow riêng.
Nếu source/test anchor đã đổi, block để review. Baseline là một PR riêng mỗi release;
V1 giảm công việc thu thập/sửa tay, chưa loại bỏ protected PR review.

## Regression evidence

Các tests hoàn toàn offline/fixtures hoặc local D1; không dispatch release/validation
thật, không PATCH GitHub variables, không deploy hoặc ghi production D1.

| Kiểm tra | Kết quả |
| --- | --- |
| Assistant + existing approval/live-state negative suites | 229/229 PASS |
| Full `npm test` | 1.265/1.265 PASS; 0 fail/skip/cancel (14 test groups, gồm release regressions) |
| Frontend typecheck | PASS |
| Worker typecheck | PASS |
| Build / staging build / auxiliary tests / diff-check | PASS / PASS / 2/2 PASS / PASS |

CLI `--help` chạy thật trên Windows PowerShell 5.1.26100 và PowerShell 7.6.5;
network writes chỉ test bằng fixtures. Lần full-suite đầu dừng ở existing DRL test
do autocrlf đổi generated SQL sang CRLF. Chuẩn hóa newline local của
`0058_seed_drl_catalog_2026.sql` về LF đúng Git blob, không sửa assertion và không
có migration diff; DRL 13/13 PASS, sau đó chạy lại full suite. Fresh Windows test
checkout nên dùng `git -c core.autocrlf=false clone ...` để tránh byte-comparison này.

Coverage: main đổi giữa confirmations và giữa PATCHes; CI sai SHA/fail/không hoàn
tất/fake publisher/latest failed; wrong Owner/run/attempt; stale/early/replayed
approval; Worker drift; schema, ledger và Scholarship immutable objects mismatch;
environment protection đổi; concurrent run/local lock; GitHub/Cloudflare HTTP errors,
timeouts, thiếu quyền; declined/noninteractive confirmation; thiếu token/gh;
redacted errors, signed-log redirect không chuyển token; Windows Node entrypoints.

## Rollback và giới hạn V1

Rollback tooling: revert PR này qua protected main; quy trình manual và toàn bộ
production workflow/guards vẫn nguyên trạng. Không đổi pin như một cách rollback code.

Rollback production là hành động Owner riêng theo runbook hiện có, cần version đã
review, traffic 100%, bindings/schema/ledger, Scholarship immutability và postflight
verification sau rollback. Assistant không tự rollback hoặc migrate dữ liệu; nếu
rollback làm provenance/pin khác, cần review/repair baseline riêng. Không coi API
upload success là rollback hoặc release PASS.

Không live-test privileged approval trong PR này. Local auth provisioning, token
rotation, protected PR review/merge, missing baseline repair và incident rollback
không được tự động hóa. Không thể chứng minh quyền write mà không thử write; auto
PATCH chỉ dùng sau explicit confirmation, quyền thiếu đi vào recovery/manual flow.
Runs >1.000, check/job metadata bị truncate, logs thiếu và evidence không đủ đều
block. CLI không thay identity proof của GitHub bằng login string hoặc local state.

References: [GitHub workflow runs](https://docs.github.com/en/rest/actions/workflow-runs),
[workflow dispatch](https://docs.github.com/en/rest/actions/workflows#create-a-workflow-dispatch-event),
[environment variables / Environments write](https://docs.github.com/en/rest/actions/variables#update-an-environment-variable),
[Cloudflare versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/).
