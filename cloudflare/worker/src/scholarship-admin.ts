import { requireBetterAuthStaff } from './better-auth-identity.ts';
import { requireScholarshipDb, readScholarshipSlug, scholarshipPagination, ScholarshipError, type ScholarshipEnv } from './scholarships.ts';
import { SCHOLARSHIP_MAX_BODY, scholarshipRecord, scholarshipText, scholarshipSha256, validateScholarshipImport, type ScholarshipMapping } from '../../../shared/scholarship-import.ts';
import { isPublicField, rankingKeys } from '../../../shared/scholarship-policy.ts';

interface AdminCampaign {
  slug: string; title: string; school_year: string; semester: string; status: string;
  revision: number; candidate_batch_id: string | null; active_batch_id: string | null;
}
interface ImportBatch {
  id: string; campaign_slug: string; status: string; source_sha256: string; payload_sha256: string;
  expected_rows: number; accepted_rows: number; rejected_rows: number; mapping_json: string;
  approved_fields_json: string | null; approval_document_json: string | null;
  source_filename: string; performed_by_user_id: string; created_at: string;
  approved_by: string | null; approved_at: string | null;
  source_list_kind: string; own_fields_json: string | null;
}
const adminCampaignView = (c: AdminCampaign) => ({ slug: c.slug, title: c.title, schoolYear: c.school_year,
  semester: c.semester, status: c.status, revision: c.revision, candidateBatchId: c.candidate_batch_id, activeBatchId: c.active_batch_id });
const error = (status: number, message: string): never => { throw new ScholarshipError(status, message); };
const keys = (body: Record<string, unknown>, allowed: string[]) => {
  if (Object.keys(body).some(k => !allowed.includes(k))) error(400, 'UNKNOWN_FIELD');
};
export const readScholarshipJson = async (request: Request): Promise<Record<string, unknown>> => {
  if (!request.headers.get('Content-Type')?.split(';')[0].trim().match(/^application\/json$/i)) error(415, 'JSON_REQUIRED');
  const declared = request.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > SCHOLARSHIP_MAX_BODY)) error(413, 'BODY_TOO_LARGE');
  if (!request.body) return error(400, 'JSON_REQUIRED');
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > SCHOLARSHIP_MAX_BODY) { await reader.cancel(); return error(413, 'BODY_TOO_LARGE'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); } catch { return error(400, 'INVALID_JSON'); }
  if (!scholarshipRecord(body)) return error(400, 'INVALID_JSON');
  return body;
};
const revision = (body: Record<string, unknown>) => {
  if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) return error(400, 'EXPECTED_REVISION_REQUIRED');
  return Number(body.expectedRevision);
};
const receipt = (batch: ImportBatch) => ({ batchId: batch.id, campaignSlug: batch.campaign_slug,
  status: batch.status, sourceSha256: batch.source_sha256, payloadSha256: batch.payload_sha256,
  expectedRows: batch.expected_rows, acceptedRows: batch.accepted_rows, rejectedRows: batch.rejected_rows, sourceListKind: batch.source_list_kind });
const readCampaign = async (db: D1Database, slug: string) => {
  const row = await db.prepare(`SELECT slug,title,school_year,semester,status,revision,candidate_batch_id,active_batch_id
    FROM scholarship_campaigns WHERE slug=?`).bind(slug).first<AdminCampaign>();
  if (!row) return error(404, 'CAMPAIGN_NOT_FOUND');
  return row;
};
const readBatch = async (db: D1Database, slug: string, id: unknown) => {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) return error(400, 'INVALID_BATCH_ID');
  const batch = await db.prepare('SELECT * FROM scholarship_import_batches WHERE campaign_slug=? AND id=?')
    .bind(slug, id).first<ImportBatch>();
  if (!batch) return error(404, 'BATCH_NOT_FOUND');
  return batch;
};
const audit = (db: D1Database, slug: string, batchId: string | null, action: string, actor: string,
  checksum: string | null = null, details: unknown = {}) => db.prepare(`INSERT INTO scholarship_audit_events
  (campaign_slug,batch_id,action,performed_by_user_id,source_sha256,details_json) VALUES (?,?,?,?,?,?)`)
  .bind(slug, batchId, action, actor, checksum, JSON.stringify(details));
const transact = async (db: D1Database, update: D1PreparedStatement, statements: D1PreparedStatement[]) => {
  try {
    await db.batch([update, db.prepare('INSERT INTO scholarship_transaction_guard(ok) VALUES (changes())'),
      ...statements, db.prepare('DELETE FROM scholarship_transaction_guard')]);
  } catch (cause) {
    // Do not expose SQL or cell values from D1 errors.
    if (cause instanceof Error && /CHECK constraint failed: ok=1/.test(cause.message)) return error(409, 'REVISION_OR_STATE_CONFLICT');
    return error(503, 'SCHOLARSHIP_DATABASE_UNAVAILABLE');
  }
};
const mutate = (db: D1Database, slug: string, expected: number, sets: string, values: (string | number | null)[]) =>
  db.prepare(`UPDATE scholarship_campaigns SET ${sets}, revision=revision+1, updated_at=datetime('now') WHERE slug=? AND revision=?`)
    .bind(...values, slug, expected);
const sourceDocument = (value: unknown) => {
  if (!scholarshipRecord(value)) return error(400, 'OFFICIAL_SOURCE_REQUIRED');
  keys(value, ['title', 'url', 'reference']);
  const title = scholarshipText(value.title, 240), reference = scholarshipText(value.reference, 240);
  let url: string | null = null;
  if (value.url !== null) {
    url = scholarshipText(value.url, 1000);
    try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error(); }
    catch { return error(400, 'INVALID_SOURCE_URL'); }
  }
  return { title, reference, url };
};

export const handleAdminScholarships = async (request: Request, url: URL, env: ScholarshipEnv) => {
  const suffix = url.pathname.slice('/api/admin/v1/scholarships'.length);
  const match = /^\/campaigns\/([^/]+)(?:\/(imports\/[a-f0-9]{64}\/rows|imports\/preview|imports\/apply|approve|publish|unpublish|rollback|archive|imports|audit))?$/.exec(suffix);
  const collection = suffix === '/campaigns';
  if (!collection && !match) return error(404, 'ENDPOINT_NOT_FOUND');
  const action = match?.[2];
  const importRows = action?.startsWith('imports/') && action.endsWith('/rows');
  const allowed = collection ? ['GET', 'POST'] : !action ? ['GET', 'PATCH'] : importRows || ['imports', 'audit'].includes(action) ? ['GET'] : ['POST'];
  if (!allowed.includes(request.method)) return error(405, 'METHOD_NOT_ALLOWED');
  const identity = await requireBetterAuthStaff(request, env);
  // Scholarship capability is deliberately narrower than the shared staff role.
  if (identity.role !== 'admin') return error(403, 'ADMIN_REQUIRED');
  if (request.method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return error(403, 'SAME_ORIGIN_REQUIRED');
  }
  const db = requireScholarshipDb(env);
  if (request.method === 'GET') {
    for (const key of url.searchParams.keys())
      if (!['page', 'limit'].includes(key) || url.searchParams.getAll(key).length !== 1) error(400, 'INVALID_QUERY');
  } else if (url.search) return error(400, 'INVALID_QUERY');
  if (collection && request.method === 'GET') {
    const { page, limit } = scholarshipPagination(url.searchParams);
    const rows = await db.prepare(`SELECT slug,title,school_year AS schoolYear,semester,status,revision,
      candidate_batch_id AS candidateBatchId,active_batch_id AS activeBatchId FROM scholarship_campaigns ORDER BY created_at DESC,slug LIMIT ? OFFSET ?`)
      .bind(limit, (page - 1) * limit).all();
    const count = await db.prepare('SELECT COUNT(*) AS total FROM scholarship_campaigns').first<{total: number}>();
    return { campaigns: rows.results, total: count?.total || 0, page, limit };
  }
  if (collection) {
    const body = await readScholarshipJson(request); keys(body, ['slug', 'title', 'schoolYear', 'semester']);
    const slug = readScholarshipSlug(scholarshipText(body.slug, 64));
    const title = scholarshipText(body.title, 240), year = scholarshipText(body.schoolYear, 80), semester = scholarshipText(body.semester, 80);
    try {
      await db.batch([db.prepare(`INSERT INTO scholarship_campaigns(slug,title,school_year,semester,source_title) VALUES (?,?,?,?, '')`)
        .bind(slug, title, year, semester), audit(db, slug, null, 'created', identity.userId)]);
    } catch (cause) {
      if (cause instanceof Error && /UNIQUE constraint/.test(cause.message)) return error(409, 'CAMPAIGN_EXISTS');
      return error(503, 'SCHOLARSHIP_DATABASE_UNAVAILABLE');
    }
    return { campaign: adminCampaignView(await readCampaign(db, slug)) };
  }
  const slug = readScholarshipSlug(match![1]);
  const campaign = await readCampaign(db, slug);
  if (request.method === 'GET') {
    if (!action) {
      if (url.search) return error(400, 'INVALID_QUERY');
      return { campaign: adminCampaignView(campaign) };
    }
    const { page, limit } = scholarshipPagination(url.searchParams);
    if (importRows) {
      const batch = await readBatch(db, slug, action!.split('/')[1]);
      const rows = await db.prepare(`SELECT id,source_row_number AS sourceRowNumber,source_identifier AS sourceIdentifier,
        student_code AS studentCode,full_name AS fullName,class_name AS className,major,award_type AS awardType,
        scholarship_type AS scholarshipType,scholarship_rank AS scholarshipRank,cohort,training_program AS trainingProgram,
        source_ordinal_json AS sourceOrdinalJson,private_rankings_json AS rankingsJson,
        scores_json AS scoresJson,source_row_sha256 AS rowSha256 FROM scholarship_snapshot_rows WHERE batch_id=?
        ORDER BY source_row_number,id LIMIT ? OFFSET ?`).bind(batch.id, limit, (page - 1) * limit).all<{scoresJson: string}>();
      return { receipt: receipt(batch), mapping: JSON.parse(batch.mapping_json), rows: rows.results.map(row => {
        const { scoresJson, sourceOrdinalJson, rankingsJson, ...values } = row as typeof row & {sourceOrdinalJson: string | null; rankingsJson: string | null};
        return { ...values, scores: JSON.parse(scoresJson), sourceOrdinal: sourceOrdinalJson ? JSON.parse(sourceOrdinalJson) : null, rankings: rankingsJson ? JSON.parse(rankingsJson) : {} };
      }), total: batch.status === 'rejected' ? 0 : batch.accepted_rows, page, limit };
    }
    const table = action === 'audit' ? 'scholarship_audit_events' : 'scholarship_import_batches';
    const result = await db.prepare(`SELECT * FROM ${table} WHERE campaign_slug=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`)
      .bind(slug, limit, (page - 1) * limit).all<Record<string, unknown> & ImportBatch>();
    const count = await db.prepare(`SELECT COUNT(*) AS total FROM ${table} WHERE campaign_slug=?`).bind(slug).first<{total: number}>();
    const items = action === 'audit' ? result.results.map(row => ({ id: row.id, campaignSlug: row.campaign_slug,
      batchId: row.batch_id, action: row.action, actorUserId: row.performed_by_user_id, sourceSha256: row.source_sha256,
      details: JSON.parse(String(row.details_json)), createdAt: row.created_at })) : result.results.map(row => ({ ...receipt(row),
        sourceFilename: row.source_filename, mapping: JSON.parse(row.mapping_json), approvedFields: row.approved_fields_json ? JSON.parse(row.approved_fields_json) : null,
        ownFields: row.own_fields_json ? JSON.parse(row.own_fields_json) : null,
        officialSource: row.approval_document_json ? JSON.parse(row.approval_document_json) : null,
        actorUserId: row.performed_by_user_id, createdAt: row.created_at, approvedBy: row.approved_by, approvedAt: row.approved_at }));
    return { [action!]: items, total: count?.total || 0, page, limit };
  }
  const body = await readScholarshipJson(request);
  if (action === 'imports/preview') {
    if (campaign.status === 'archived') return error(409, 'CAMPAIGN_ARCHIVED');
    const dataset = await validateScholarshipImport(body);
    if (dataset.mapping.scores.some(score => score.key === 'trainingProgram' || rankingKeys.some(key => key === score.key)))
      return error(400, 'ELIGIBILITY_MAPPING_CONVERSION_REQUIRED');
    if (dataset.errors.length) {
      const payloadHash = await scholarshipSha256(JSON.stringify(body));
      const id = await scholarshipSha256(JSON.stringify([slug, dataset.sourceSha256, payloadHash, 'rejected']));
      const prior = await db.prepare('SELECT * FROM scholarship_import_batches WHERE id=?').bind(id).first<ImportBatch>();
      if (!prior) {
        try {
          await db.batch([db.prepare(`INSERT INTO scholarship_import_batches
            (id,campaign_slug,source_sha256,source_filename,expected_rows,accepted_rows,rejected_rows,status,performed_by_user_id,mapping_json,payload_sha256)
            VALUES (?,?,?,?,?,?,?,'rejected',?,?,?)`).bind(id, slug, dataset.sourceSha256, dataset.sourceFilename, dataset.expectedRows,
              dataset.acceptedRows, dataset.rejectedRows, identity.userId, JSON.stringify(dataset.mapping), payloadHash),
            audit(db, slug, id, 'previewed', identity.userId, dataset.sourceSha256, { rejectedRows: dataset.rejectedRows, errors: dataset.errors })]);
        } catch {
          const retry = await db.prepare('SELECT id FROM scholarship_import_batches WHERE id=?').bind(id).first();
          if (!retry) return error(503, 'SCHOLARSHIP_DATABASE_UNAVAILABLE');
        }
      }
      return { valid: false, receipt: receipt(prior || await readBatch(db, slug, id)), expectedRows: dataset.expectedRows,
        acceptedRows: dataset.acceptedRows, rejectedRows: dataset.rejectedRows, errors: dataset.errors, idempotent: Boolean(prior) };
    }
    const id = await scholarshipSha256(JSON.stringify([slug, dataset.sourceSha256, dataset.payloadSha256]));
    const prior = await db.prepare('SELECT * FROM scholarship_import_batches WHERE id=?').bind(id).first<ImportBatch>();
    if (prior) return { valid: true, receipt: receipt(prior), idempotent: true, revision: campaign.revision };
    const statements = [db.prepare(`INSERT INTO scholarship_import_batches
      (id,campaign_slug,source_sha256,source_filename,expected_rows,accepted_rows,rejected_rows,status,performed_by_user_id,mapping_json,payload_sha256,source_list_kind)
      VALUES (?,?,?,?,?,?,0,'previewed',?,?,?,?)`).bind(id, slug, dataset.sourceSha256, dataset.sourceFilename,
        dataset.expectedRows, dataset.acceptedRows, identity.userId, JSON.stringify(dataset.mapping), dataset.payloadSha256, dataset.mapping.sourceListKind ?? 'unspecified')];
    // Small JSON chunks bound SQL variables and size while a single batch is atomic.
    for (let offset = 0; offset < dataset.rows.length; offset += 50) {
      statements.push(db.prepare(`INSERT INTO scholarship_snapshot_rows
        (batch_id,source_row_number,source_identifier,student_code,full_name,full_name_search,class_name,major,award_type,scholarship_type,scholarship_rank,cohort,scores_json,source_row_sha256,training_program,source_ordinal_json,private_rankings_json)
        SELECT ?,json_extract(value,'$.sourceRowNumber'),json_extract(value,'$.sourceIdentifier'),json_extract(value,'$.studentCode'),
          json_extract(value,'$.fullName'),json_extract(value,'$.fullNameSearch'),json_extract(value,'$.className'),json_extract(value,'$.major'),
          json_extract(value,'$.awardType'),json_extract(value,'$.scholarshipType'),json_extract(value,'$.scholarshipRank'),json_extract(value,'$.cohort'),
          json_extract(value,'$.scores'),json_extract(value,'$.rowSha256'),json_extract(value,'$.trainingProgram'),
          CASE WHEN json_type(value,'$.sourceOrdinal') IS NOT NULL THEN json_quote(json_extract(value,'$.sourceOrdinal')) END,
          json_extract(value,'$.rankings') FROM json_each(?)`)
        .bind(id, JSON.stringify(dataset.rows.slice(offset, offset + 50))));
    }
    statements.push(audit(db, slug, id, 'previewed', identity.userId, dataset.sourceSha256,
      { rows: dataset.acceptedRows, payloadSha256: dataset.payloadSha256 }));
    // Preview must not change campaign revision/publication. Unique ID serializes retries.
    try { await db.batch(statements); }
    catch {
      const retried = await db.prepare('SELECT * FROM scholarship_import_batches WHERE id=?').bind(id).first<ImportBatch>();
      if (retried) return { valid: true, receipt: receipt(retried), idempotent: true, revision: campaign.revision };
      return error(503, 'SCHOLARSHIP_DATABASE_UNAVAILABLE');
    }
    return { valid: true, receipt: receipt(await readBatch(db, slug, id)), idempotent: false, revision: campaign.revision };
  }
  const expected = revision(body);
  if (action !== 'imports/apply' && expected !== campaign.revision) return error(409, 'REVISION_OR_STATE_CONFLICT');
  if (!action) {
    keys(body, ['expectedRevision', 'title', 'schoolYear', 'semester']);
    if (campaign.status !== 'draft') return error(409, 'EDIT_REQUIRES_DRAFT');
    const title = body.title === undefined ? campaign.title : scholarshipText(body.title, 240);
    const year = body.schoolYear === undefined ? campaign.school_year : scholarshipText(body.schoolYear, 80);
    const semester = body.semester === undefined ? campaign.semester : scholarshipText(body.semester, 80);
    await transact(db, mutate(db, slug, expected, 'title=?,school_year=?,semester=?', [title, year, semester]),
      [audit(db, slug, null, 'updated', identity.userId)]);
  } else if (action === 'imports/apply') {
    keys(body, ['expectedRevision', 'batchId']);
    const batch = await readBatch(db, slug, body.batchId);
    if (batch.status === 'applied' && campaign.candidate_batch_id === batch.id)
      return { campaign: adminCampaignView(campaign), receipt: receipt(batch), idempotent: true };
    if (expected !== campaign.revision) return error(409, 'REVISION_OR_STATE_CONFLICT');
    if (!['draft', 'validated'].includes(campaign.status) || batch.status !== 'previewed') return error(409, 'UNPUBLISH_BEFORE_APPLY');
    const count = await db.prepare('SELECT COUNT(*) AS n FROM scholarship_snapshot_rows WHERE batch_id=?').bind(batch.id).first<{n: number}>();
    if (batch.rejected_rows || count?.n !== batch.expected_rows || batch.accepted_rows !== batch.expected_rows) return error(409, 'CORRUPT_BATCH');
    const stored = await db.prepare(`SELECT source_row_number AS sourceRowNumber,source_identifier AS sourceIdentifier,
      student_code AS studentCode,full_name AS fullName,full_name_search AS fullNameSearch,class_name AS className,
      major,award_type AS awardType,scholarship_type AS scholarshipType,scholarship_rank AS scholarshipRank,cohort,
      scores_json AS scoresJson,source_row_sha256 AS rowSha256,training_program AS trainingProgram,
      source_ordinal_json AS sourceOrdinalJson,private_rankings_json AS rankingsJson
      FROM scholarship_snapshot_rows WHERE batch_id=? ORDER BY source_row_number`).bind(batch.id)
      .all<{ sourceRowNumber: number; sourceIdentifier: string | null; studentCode: string; fullName: string; fullNameSearch: string;
        className: string | null; major: string | null; awardType: string; scholarshipType?: string | null;
        scholarshipRank?: string | null; cohort?: string | null; scoresJson: string; rowSha256: string;
        trainingProgram: string | null; sourceOrdinalJson: string | null; rankingsJson: string | null }>();
    const mapping: ScholarshipMapping = JSON.parse(batch.mapping_json);
    const canonical = [];
    if ((mapping.sourceListKind ?? 'unspecified') !== batch.source_list_kind) return error(409, 'CORRUPT_BATCH');
    for (const storedRow of stored.results) {
      const { scoresJson, rowSha256, trainingProgram, sourceOrdinalJson, rankingsJson, ...row } = storedRow;
      for (const key of ['scholarshipType', 'scholarshipRank', 'cohort'] as const)
        if (!mapping[key]) delete row[key];
      const content = { ...row, scores: JSON.parse(scoresJson),
        ...(mapping.trainingProgram ? {trainingProgram} : {}),
        ...(mapping.sourceOrdinal ? {sourceOrdinal: JSON.parse(sourceOrdinalJson!)} : {}),
        ...(mapping.rankings ? {rankings: JSON.parse(rankingsJson!)} : {}) };
      if (await scholarshipSha256(JSON.stringify(content)) !== rowSha256) return error(409, 'CORRUPT_BATCH');
      canonical.push({ ...content, rowSha256 });
    }
    if (await scholarshipSha256(JSON.stringify({ mapping: JSON.parse(batch.mapping_json), rows: canonical })) !== batch.payload_sha256)
      return error(409, 'CORRUPT_BATCH');
    await transact(db, mutate(db, slug, expected, "candidate_batch_id=?,status='validated',public_data_approved=0,public_scores_approved=0", [batch.id]),
      [db.prepare("UPDATE scholarship_import_batches SET status='applied' WHERE id=?").bind(batch.id),
        audit(db, slug, batch.id, 'applied', identity.userId, batch.source_sha256)]);
    return { campaign: adminCampaignView(await readCampaign(db, slug)), receipt: receipt(await readBatch(db, slug, batch.id)), idempotent: false };
  } else if (action === 'approve') {
    keys(body, ['expectedRevision', 'batchId', 'sourceSha256', 'officialSource', 'approvedFields', 'republicationConfirmed', 'ownFields', 'ownAccessConfirmed']);
    const batch = await readBatch(db, slug, body.batchId);
    if (campaign.status !== 'validated' || campaign.candidate_batch_id !== batch.id || batch.status !== 'applied') return error(409, 'VALIDATED_BATCH_REQUIRED');
    if (body.sourceSha256 !== batch.source_sha256 || body.republicationConfirmed !== true) return error(400, 'REPUBLICATION_CONFIRMATION_REQUIRED');
    const document = sourceDocument(body.officialSource);
    const mapping: ScholarshipMapping = JSON.parse(batch.mapping_json);
    const allowed = ['fullName', 'studentCode', 'awardType', ...(mapping.className ? ['className'] : []),
      ...(mapping.major ? ['major'] : []),
      ...(['scholarshipType', 'scholarshipRank', 'cohort', 'trainingProgram', 'sourceOrdinal'] as const).filter(key => mapping[key]),
      ...mapping.scores.map(s => 'scores.' + s.key)];
    const approvedFields = body.approvedFields;
    if (!Array.isArray(approvedFields) || approvedFields.some(f => typeof f !== 'string' || !allowed.includes(f) || !isPublicField(f)) ||
      new Set(approvedFields).size !== approvedFields.length ||
      ['fullName', 'studentCode', 'awardType'].some(f => !approvedFields.includes(f))) return error(400, 'EXPLICIT_PUBLIC_FIELDS_REQUIRED');
    const fields = JSON.stringify([...approvedFields].sort());
    const ownAllowed = [...allowed.filter(isPublicField), ...(mapping.rankings ?? []).map(r => 'rankings.' + r.key)];
    const ownFields = body.ownFields === undefined ? approvedFields : body.ownFields;
    if (!Array.isArray(ownFields) || ownFields.some(f => typeof f !== 'string' || !ownAllowed.includes(f)) || new Set(ownFields).size !== ownFields.length)
      return error(400, 'EXPLICIT_OWN_FIELDS_REQUIRED');
    if (body.ownFields !== undefined && body.ownAccessConfirmed !== true) return error(400, 'OWN_ACCESS_CONFIRMATION_REQUIRED');
    await transact(db, mutate(db, slug, expected, "status='approved',public_data_approved=1,source_title=?,source_url=?,source_sha256=?", [document.title, document.url, batch.source_sha256]),
      [db.prepare(`UPDATE scholarship_import_batches SET approved_fields_json=?,approval_document_json=?,approved_by=?,own_fields_json=?,approved_at=datetime('now') WHERE id=?`)
        .bind(fields, JSON.stringify(document), identity.userId, JSON.stringify([...ownFields].sort()), batch.id),
        audit(db, slug, batch.id, 'approved', identity.userId, batch.source_sha256, { document, approvedFields, ownFields, sourceListKind: batch.source_list_kind })]);
  } else if (action === 'publish' || action === 'rollback') {
    keys(body, ['expectedRevision', 'batchId']);
    const batch = await readBatch(db, slug, body.batchId);
    if (batch.status !== 'applied' || !batch.approved_fields_json || !batch.approval_document_json) return error(409, 'APPROVED_BATCH_REQUIRED');
    if (action === 'publish' && (campaign.status !== 'approved' || campaign.candidate_batch_id !== batch.id)) return error(409, 'APPROVED_CAMPAIGN_REQUIRED');
    if (action === 'rollback') {
      if (!['published', 'approved', 'validated'].includes(campaign.status)) return error(409, 'ROLLBACK_STATE_INVALID');
      const prior = await db.prepare("SELECT id FROM scholarship_audit_events WHERE campaign_slug=? AND batch_id=? AND action IN ('published','rollback') LIMIT 1")
        .bind(slug, batch.id).first();
      if (!prior) return error(409, 'PREVIOUS_PUBLICATION_REQUIRED');
    }
    const doc = JSON.parse(batch.approval_document_json);
    await transact(db, mutate(db, slug, expected, "active_batch_id=?,candidate_batch_id=?,status='published',public_data_approved=1,public_scores_approved=0,published_at=datetime('now'),source_title=?,source_url=?,source_sha256=?",
      [batch.id, batch.id, doc.title, doc.url, batch.source_sha256]), [audit(db, slug, batch.id, action === 'publish' ? 'published' : 'rollback', identity.userId, batch.source_sha256)]);
  } else if (action === 'unpublish' || action === 'archive') {
    keys(body, ['expectedRevision']);
    if (action === 'unpublish' && !['published', 'approved'].includes(campaign.status)) return error(409, 'PUBLICATION_REQUIRED');
    if (campaign.status === 'archived') return error(409, 'ALREADY_ARCHIVED');
    const batchId = campaign.active_batch_id || campaign.candidate_batch_id;
    const batch = batchId ? await readBatch(db, slug, batchId) : null;
    await transact(db, mutate(db, slug, expected, `status=?,public_data_approved=0,public_scores_approved=0,published_at=NULL`,
      [action === 'archive' ? 'archived' : 'validated']), [audit(db, slug, batchId, action === 'archive' ? 'archived' : 'unpublished', identity.userId, batch?.source_sha256 ?? null)]);
  }
  return { campaign: adminCampaignView(await readCampaign(db, slug)) };
};
