# HUB Scholarship — API Contract v1.1.0

Backward-compatible extension for Antigravity, 2026-10-14. Branch: `feature/hub-scholarship-foundation`.
Backend implementation and test commit: `c78ab17c1115059b1c547e1e7ebad942901ede53`.
Source of truth: `cloudflare/worker/src/scholarships.ts`, `scholarship-admin.ts`,
`shared/scholarship-import.ts`, migrations `0055` and `0056`.

## Release status and publication rules

Backend implemented and locally tested. This is a frontend integration handoff, not production verification or release approval.
No deployment, remote migration, merge, official student import or Auth Worker change has been performed.
The official award file and school authorization to republish each field are still required before real ingestion/publication.
Public clients see an empty campaign list until an Admin explicitly applies, approves and publishes a snapshot.

Migration 0056 is additive to 0055 and preserves old tables/rows. The old recipient table and aggregate score flags do not authorize publication in v1.0.
Only `scholarship_snapshot_rows` belonging to the campaign's **active approved batch** can be read publicly or through the verified-own API.
Preview rows, inactive snapshots and guessed batch IDs confer no public access. Applied snapshot rows are immutable through SQL triggers.
Awards are official source decisions; no GPA, ranking, directory record or forecast can produce an award.

All scholarship responses use `Cache-Control: no-store` (Admin and own use `private, no-store`).
Recipient/search data is not cached, so unpublish takes effect on subsequent reads. A previously delivered response cannot be revoked from a user's device.
Search requests with `q` use `SCHOLARSHIP_SEARCH_RATE_LIMIT`: 60 requests per 60 seconds per Cloudflare-provided IP,
including `q` on recipients. Filtered reads and every facets request share this limiter. The binding is configured in the Public Worker only. Cloudflare limits are approximate and per location;
this is a traffic safeguard, not an anti-enumeration guarantee. Local requests without a Cloudflare IP/binding are not throttled.
The implementation never logs search text, row cells, names or student codes.

## Common protocol

- JSON success responses: HTTP **200**, including create and invalid-row preview reports.
- Failures: `{ "error": "message or stable Admin validation code" }`.
- `400`: malformed/unknown/repeated query, invalid slug/body/mapping/revision or approval fields.
- `401`: absent/expired Better Auth session. `403`: wrong role, cross-origin mutation or forbidden identity.
- `404`: unknown endpoint/campaign/batch; public APIs also use 404 for nonpublic campaigns.
- `405`: unsupported method (`Allow` header; global OPTIONS uses the existing CORS handling).
- `409`: stale revision, invalid state, duplicate campaign, damaged batch or unapproved rollback target.
- `413`: JSON request exceeds 1 MiB. `415`: Admin mutation is not `application/json`.
- `429`: search limit exceeded, `Retry-After: 60`. `503`: D1/Auth unavailable or invalid upstream response; diagnostics are not exposed.
- Pagination: decimal `page=1..10000`, `limit=1..50`; defaults 1 and 20. Empty pages are valid. No exponent, zero, negative, blank or repeated values.
- Slug: `^[a-z0-9][a-z0-9-]{0,63}$`. Unknown parameters are rejected; there is no client-selectable sort.
- Dates are server SQLite UTC strings (for example `2026-10-13 06:00:00`); clients should parse as UTC.

## Public data shapes

`Campaign`:

```ts
{
  slug: string; title: string; schoolYear: string; semester: string;
  sourceTitle: string; sourceUrl: string | null; sourceDocument: string;
  sourceSha256: string; publishedAt: string;
  approvedFields: string[];
  scoreColumns: { key: string; label: string }[];
}
```

`Recipient`:

```ts
{
  id: number; fullName: string; studentCode: string; awardType: string;
  className: string | null; major: string | null;
  scholarshipType: string | null; scholarshipRank: string | null; cohort: string | null;
  scores: Record<string, number | string | null>;
  gpa: number | string | null;
  trainingScore: number | string | null;
  selectionScore: number | string | null;
}
```

`fullName`, `studentCode`, `awardType` require explicit approval before publication.
Unapproved class/major become null. `scores` contains **only explicitly approved individual keys**.
The three legacy score properties alias `scores.gpa`, `scores.trainingScore`, `scores.selectionScore`, or null if absent/unapproved.
They are not inferred or coerced. Use `scoreColumns` and `scores` for new UI: the source may use a different scale or textual value such as `"9,7"`.
Null means missing or not approved; never substitute zero, assume GPA /4, or derive an award.
Raw source row numbers, source identifiers, private score columns, filename, mapping and actor IDs are Admin-only.
Recipient IDs identify immutable snapshot rows; they may change across replacement imports and are never proof of ownership.

## Public endpoints (no login)

### `GET /api/public/v1/scholarships/campaigns`

Query: `page`, `limit`, optional exact `schoolYear` and `semester` (nonempty, max 80 characters).
Response: `{ campaigns: Campaign[], total: number, page: number, limit: number }`.
Order: publication time descending, slug descending. Paginate to access all published campaigns; no silent 30-campaign cap.
Empty response is a valid pre-launch state.

### `GET /api/public/v1/scholarships/:slug/summary`

No query parameters. Response:
`{ campaign: Campaign, totalRecipients: number, totalStudents: number, awards: {awardType:string,count:number}[] }`.
Counts only the active published snapshot. A student with two awards contributes two recipients and one student.

### `GET /api/public/v1/scholarships/:slug/recipients`

Query: `page`, `limit`, optional `q`, legacy exact `awardType` (max 120), and exact `scholarshipType`, `scholarshipRank`, `major`, `className`, `cohort` (max 160 each). All conditions combine with AND.
Response: `{ campaign: Campaign, recipients: Recipient[], total: number, page: number, limit: number }`.
Order: original source row number ascending, recipient ID ascending. No score/name sorting.

### `GET /api/public/v1/scholarships/:slug/search`

Same response and filters as recipients, with **required `q` of 2–80 characters** after trimming/NFC normalization.
Optional `q` on recipients has the same semantics; empty `q` on recipients means no search.
Controls are rejected. Names match a literal normalized substring anywhere in a name: lowercase, removed Vietnamese diacritics,
`đ → d`, collapsed whitespace. `Văn Đạt`, `van dat` and `DAT` can match `Nguyễn Văn Đạt`.
This is substring matching, not fuzzy matching, token rearrangement or ownership verification.
Queries containing 2–12 digits match a student-code prefix; a complete 12-digit code gives an exact code match.
Percent, underscore and backslash are escaped and cannot broaden SQL LIKE matching.
The `(batch_id, full_name_search)` index bounds the substring scan to one snapshot; arbitrary substring is not an indexed prefix lookup.
Duplicate names are returned as separate matching rows. No match gives HTTP 200 and `recipients:[]`, `total:0`.

## Verified personal awards

### `GET /api/me/scholarships`

Same-origin Better Auth cookie session. No query parameters (including `studentCode`, `userId`, `recipientId`); only GET.
Server reads the existing Auth service identity and verified school-email convention:
`^(\d{12})@st.buh.edu.vn$`, matching server session user ID and email with `emailVerified === true`.
Client headers, bodies and public search results cannot select another student's identity. Auth Worker and Student Directory logic are unchanged.

Response: `{ verified: boolean, awards: OwnAward[] }`, where:

```ts
type OwnAward = Recipient & {
  campaignSlug: string; campaignTitle: string; schoolYear: string; semester: string;
};
```

All matching published awards across campaigns are returned; there is no silent 100-award cutoff.
Individual score approval gates also apply to this endpoint.

- HTTP 401: login needed or session expired.
- `verified:false, awards:[]`: authenticated account lacks a verified student email/code.
- `verified:true, awards:[]`: verified student has no matching officially published award.
- `verified:true` with awards: frontend may select one of these records for personal celebration.
- HTTP 503: service/identity failure, not a no-award state.

The celebration UI must re-use these server records, preserve identity/category, and prohibit public-search ownership claims.
Portrait upload/crop/export stays in browser memory/Canvas. There is no backend portrait upload, share page or image persistence in MVP.

## Admin capability and states

Namespace: `/api/admin/v1/scholarships`. All reads and mutations require the **server-verified Better Auth `admin` role**
via the existing `/internal/auth/staff` service binding. Auditor/user cannot import, approve, publish or read private previews.
Mutations require JSON and `Origin` equal to the request URL origin; `Sec-Fetch-Site: cross-site` is rejected.
Use same-origin browser credentials. Do not send Auth cookies to unrelated hosts.

Campaign state transitions:

```text
create → draft → apply(valid preview) → validated → approve → approved → publish → published
approved/published → unpublish → validated (hidden; candidate retained)
draft/validated → apply replacement preview → validated (prior batches retained)
validated/approved/published → rollback previously published approved batch → published
any nonarchived state → archive → archived (terminal, hidden; no physical delete)
```

Preview is private and allowed in any nonarchived state; it does not change revision or the live snapshot.
Apply on approved/published is rejected: explicitly unpublish first. This MVP replacement workflow has a public availability gap between unpublish and publish.
Approval records official document, checksum, actor, time and each approved field. No automatic score permission.
Rollback requires a previously published batch belonging to this campaign, with stored approval; it cannot publish a merely previewed/imported batch.
Unpublish hides the campaign but retains historical batch approval for explicit Admin rollback. Archive blocks rollback/preview.
Applied recipient content is immutable. Re-import changed data/mapping as a new preview/batch.

Every mutation except create/preview requires `expectedRevision` (nonnegative safe integer).
Successful state/edit mutations increment revision once. Fetch the current campaign before changing it.
D1 `batch()` transaction covers pointer/state, receipt and audit changes. A CAS guard aborts stale concurrent updates entirely.
Retries of the currently applied candidate return `idempotent:true` even with a stale revision; they perform no write.

`AdminCampaign`:

```ts
{ slug:string; title:string; schoolYear:string; semester:string; status:string; revision:number;
  candidateBatchId:string|null; activeBatchId:string|null }
```

`Receipt`:

```ts
{ batchId:string; campaignSlug:string; status:'previewed'|'applied'|'rejected';
  sourceSha256:string; payloadSha256:string; expectedRows:number; acceptedRows:number; rejectedRows:number }
```

### Campaign CRUD and inspection

| Method and relative route | Input | Success |
| --- | --- | --- |
| GET `/campaigns` | `page`, `limit` | `{campaigns:AdminCampaign[],total,page,limit}` |
| POST `/campaigns` | `{slug,title,schoolYear,semester}` | `{campaign:AdminCampaign}` (draft, revision 0) |
| GET `/campaigns/:slug` | no query | `{campaign:AdminCampaign}` |
| PATCH `/campaigns/:slug` | `{expectedRevision,title?,schoolYear?,semester?}`; draft only | `{campaign:AdminCampaign}` |
| GET `/campaigns/:slug/imports` | `page`, `limit` | `{imports:ImportMetadata[],total,page,limit}` |
| GET `/campaigns/:slug/imports/:batchId/rows` | `page`, `limit` | `{receipt,mapping,rows,total,page,limit}` |
| GET `/campaigns/:slug/audit` | `page`, `limit` | `{audit:AuditEvent[],total,page,limit}` |

Title max 240; schoolYear/semester max 80; all required text is nonempty, NFC-trimmed and control-free.
No hard-delete endpoint; archive is the supported removal path.
Private rows: `{id,sourceRowNumber,sourceIdentifier,studentCode,fullName,className,major,awardType,scores,rowSha256}`.
Rejected receipts have no stored recipient rows and rows total 0.
`ImportMetadata` adds to Receipt: `{sourceFilename,mapping,approvedFields:string[]|null,officialSource:OfficialSource|null,
actorUserId,createdAt,approvedBy:string|null,approvedAt:string|null}`.
`AuditEvent`: `{id,campaignSlug,batchId:string|null,action,actorUserId,sourceSha256:string|null,details:object,createdAt}`.
Audit/import lists order createdAt descending then ID descending. Audit details hold checksums, source approval fields or row-number/error codes, never row cell values.

### `POST /campaigns/:slug/imports/preview`

Input (trusted offline XLSX/CSV preparation output):

```ts
{
  sourceSha256: string; // SHA-256 of original source bytes, lowercase 64 hex
  sourceFilename: string; // basename, 1..160 chars, no slash/backslash
  mapping: {
    studentCode:string; fullName:string; awardType:string;
    className?:string; major?:string; sourceIdentifier?:string;
    scholarshipType?:string; scholarshipRank?:string; cohort?:string;
    scores:{key:string,column:string,label:string}[];
  };
  rows:{sourceRowNumber:number,values:Record<string,string|number|null>}[];
}
```

Mapping values are **source header names**, max 120 characters. Columns cannot be mapped ambiguously to multiple fields.
Scores: required array (may be empty), max 16; unique keys `^[a-z][a-zA-Z0-9_]{0,31}$`; labels max 120.
Rows: 1..2000 per complete snapshot; sourceRowNumber unique positive integer <= 1,000,000; values max 40 columns;
all mapped columns must exist; scalar cells only, text <= 500, finite numbers.
Student code must be **text containing exactly 12 digits**; no inferred leading zero or scientific notation.
Names <=160, awards <=120, class/major/source identifier <=160. Score text <=120, no imposed numeric scale or decimal coercion.
Unknown structural fields and control characters are rejected. Source order and identifiers are preserved in the private snapshot.

Different awards for the same student are valid. Same student+category without distinct source award identifiers is ambiguous and rejected.
When mapping `sourceIdentifier`, every row must provide a globally unique nonempty identifier within that batch.
Conflicting normalized names for one code, duplicate source row or identifier, malformed/missing cells reject the entire import.
No valid subset is applied. The errors include only `{sourceRowNumber,field:'row',code}`; never PII cell values.

Valid response: `{valid:true,receipt:Receipt,idempotent:boolean,revision:number}`.
Invalid-row response (200): `{valid:false,receipt:Receipt,expectedRows,acceptedRows,rejectedRows,errors:[...],idempotent:boolean}`.
Malformed request/mapping gives 400 without a receipt. Rejected row previews persist a rejected receipt/audit, **zero recipient rows**.
Inspect mapped private data through the rows endpoint before apply/approval.

Source SHA comes from the trusted offline preparer; the Worker receives parsed JSON, not the original file bytes,
so it cannot independently prove file authenticity. The Admin must compare the checksum against the supplied official file/document.
Worker recomputes SHA-256 of canonical rows/mapping and each row, checks them again before apply, and derives batch ID from campaign/source/payload.
Same source+mapping+rows is idempotent; changed mapping/content creates a separate batch even when source SHA is the same.

### Apply, approval and publication

| POST relative route | Exact JSON input | Success |
| --- | --- | --- |
| `/campaigns/:slug/imports/apply` | `{expectedRevision,batchId}` | `{campaign:AdminCampaign,receipt:Receipt,idempotent:boolean}` |
| `/campaigns/:slug/approve` | See approval body below | `{campaign:AdminCampaign}` |
| `/campaigns/:slug/publish` | `{expectedRevision,batchId}` | `{campaign:AdminCampaign}` |
| `/campaigns/:slug/unpublish` | `{expectedRevision}` | `{campaign:AdminCampaign}` |
| `/campaigns/:slug/rollback` | `{expectedRevision,batchId}` | `{campaign:AdminCampaign}` |
| `/campaigns/:slug/archive` | `{expectedRevision}` | `{campaign:AdminCampaign}` |

Approval body:

```ts
{
  expectedRevision:number; batchId:string; sourceSha256:string;
  officialSource:{title:string,url:string|null,reference:string};
  approvedFields:string[]; republicationConfirmed:true;
}
```

Official source title/reference: nonempty <=240 characters; url: explicit null or HTTPS <=1000, no embedded credentials.
`sourceSha256` must exactly match the candidate receipt.
`approvedFields` must explicitly include `fullName`, `studentCode`, `awardType`.
Optional approved fields: individually mapped `className`, `major`, `cohort`, `scholarshipType`, `scholarshipRank`, and each mapped `scores.<key>` separately.
No wildcard/all-scores approval, duplicate fields, unknown score or source identifier approval. `republicationConfirmed` must be literal true.
Batch IDs are lowercase 64 hex and must belong to this campaign. Publish only the approved candidate.

## Trusted offline preparation (no remote apply)

Create a private mapping JSON, review the original official file, and run:

```powershell
node scripts/prepare-scholarship-import.mjs --file C:\private\official.xlsx --mapping C:\private\mapping.json --sheet Awards --output .scholarship-private\preview.json
node scripts/prepare-scholarship-import.mjs --file C:\private\official.csv --mapping C:\private\mapping.json --delimiter semicolon --output .scholarship-private\preview.json
```

Create the output directory first. Output creation is exclusive: existing files are never overwritten.
The CLI defaults to validation only, prints counts/checksums/row errors and never prints student values.
It makes no network call and has no D1 apply/remote mode. Submit reviewed JSON through the authenticated Admin preview API,
then separately apply, explicitly approve the school-authorized fields and publish. Never commit source files or private payloads;
`.scholarship-private/` is ignored. Windows users must keep exports in a private directory with appropriate filesystem ACLs.

Limits: source <=4 MiB; mapping <=16 KiB; JSON <=1 MiB; 2000 rows; 40 columns. Oversized datasets fail; there is no silent truncation/chunk append.
CSV requires UTF-8, explicit delimiter (comma default; semicolon/tab supported), unique headers, consistent cell counts,
valid quoting, no internal blank records. Record positions preserve source order; multiline mapped values fail control-character validation.
XLSX requires explicit sheet when multiple sheets exist; rejects merged cells, formula/cache values, dates, rich text and hyperlink objects.
Numerical MSSV cells are rejected. ZIP inspection checks member CRC/actual expansion, <=128 members, <=4 MiB per member,
<=16 MiB total expansion, bounded compression ratio, no ZIP64/multipart/encryption/path traversal/macros/external links.
Unsupported XLS/XLSM is rejected. This conservative parser may require a reviewed clean source export; it does not invent missing semantics.

## Synthetic local fixtures and frontend integration

All examples below are synthetic, matching local test shapes; never seed them into production.

```json
{"campaigns":[],"total":0,"page":1,"limit":20}
```

```json
{"verified":false,"awards":[]}
```

Published recipient example (inside a paginated response; `privateScore` is intentionally absent):

```json
{"id":1,"fullName":"Nguyễn Văn Đạt","studentCode":"000000000001","awardType":"Giỏi","className":null,"major":null,"scores":{"gpa":9.5},"gpa":9.5,"trainingScore":null,"selectionScore":null}
```

Antigravity should branch from the backend branch's latest committed HEAD into `feature/hub-scholarship-frontend`;
keep its Draft PR targeting the backend branch. Use actual API fields above and preserve existing auth/navigation/mobile shells.
Handle loading, empty campaign, no-match, duplicate name, null/private scores, expired session and service failure separately.
Use `/api/me/scholarships` for personal selection only; no student-code override, public “claim this award”, or portrait server upload.
Do not modify Workers/migrations or initiate deployment. Refresh verified awards before celebration; unpublish can remove eligibility.

## ANTIGRAVITY_READY

See `docs/hub-scholarship-backend-handoff.md` for the final test ledger and readiness verdict.
Backend implementation and tests: `c78ab17c1115059b1c547e1e7ebad942901ede53`; v1.0 baseline; extended contract: **v1.1.0**.
This handoff permits frontend integration with empty production data and synthetic local fixtures only.
Production remains unverified; real source, field authorization and a separately approved release are outstanding.

Implementation references: [D1 transactional batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch),
[Cloudflare rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## v1.1.0 combined filtering and source semantics

Migration **0057** adds nullable scholarship_type, scholarship_rank and cohort columns plus snapshot indexes. No backfill or parsing of legacy values. Existing applied snapshots and old preview row/payload checksums remain unchanged. Optional importer mappings have separate source columns; ambiguous mapping is rejected. The offline CSV/XLSX preparer uses the same validator. When independent program/rank fields distinguish two source awards, duplicates are validated using those fields as well as legacy category and source identifier.

`awardType` remains the mandatory v1.0 legacy source label. Its old filter/summary semantics are unchanged. It is **never** used to fill either new field. No cohort inference from MSSV/class name, and no classification from GPA. New imports may include the separate mappings only when the source explicitly contains them. Existing clients remain usable; new clients must not label the legacy field as both type and rank. No real official file was supplied or imported.

Optional fields are public (including own awards) only if individually approved. Unmapped/unapproved fields serialize as null. Filtering an unapproved/unmapped field yields zero results, never a private-field match. Empty or repeated filter parameters, unknown keys, controls including DEL and oversized values give 400. Exact filters are NFC-trimmed and case/diacritic-sensitive; q retains Vietnamese-normalized substring/code-prefix semantics and is 2–80 characters when nonempty. No client-selectable campaign/batch IDs: campaignSlug comes solely from the route.

### GET /api/public/v1/scholarships/:slug/facets

Same publication/approval/revision gates as recipients. Queries: q, legacy awardType, scholarshipType, scholarshipRank, major, className, cohort, facetPage (1–2000, default 1), facetLimit (1–200, default 100). Recipient page/limit are not accepted here.

Response:

```ts
{
  apiVersion: '1.1.0'; campaign: Campaign; totalRecipients: number;
  supportedFilters: ('scholarshipType'|'scholarshipRank'|'major'|'className'|'cohort')[];
  facets: Record<'scholarshipType'|'scholarshipRank'|'major'|'className'|'cohort', {
    options: string[]; total: number; page: number; limit: number;
  }>;
}
```

supportedFilters requires both source mapping and approval. Options are DISTINCT nonempty approved values, sorted by SQLite BINARY, paginated independently per facet with a common page/limit request. There is no hard-coded catalog or silent truncation. Each facet ignores only its **own** selected filter and applies q plus every other condition. Thus class options depend on selected major/cohort/type/rank. totalRecipients uses **all** selected filters, exactly like recipients/search. Null values are excluded from options but retained as null in recipients.

Maximum source snapshot remains 2000 rows; options therefore have at most 2000 distinct values per field. Metadata returns strings only, not recipient rows. At most eleven bounded SQL statements per supported facets call (one count plus two per facet); unapproved facets execute no option query. Snapshot-first indexes bound scans; cohort/major/class has a composite index. q substring scans stay bounded to the active snapshot. Filter/facets requests share the existing 60/minute/IP binding; 429 preserves Retry-After. No raw filters/PII are logged.

Frontend should fetch all metadata pages if needed, cancel stale requests, disable controls until metadata is loaded, preserve selected values if the new conjunction has no results, and show zero results rather than clear another condition silently. Reset recipient page on filter changes; preserve unrelated URL parameters. Fetch recipients page-by-page, never load the whole recipient dataset for filtering.

Validation and readiness for this extension are recorded in docs/hub-scholarship-filter-extension.md. Production release remains unverified and requires separate approval.
