/** Server-side official catalogue boundary. No publication endpoint or auto-open. */
export const GATED_SEMESTER = 'HK2_2026_2027';
export const HK2_MANIFEST = '2fe8af0743805fcc64ba414e22817fb26f3b5ce2247b50677bc518122c36e212';
export const HK2_PAYLOAD = '2d328a92c048d2869e49cf7abd078f1b9ee44afb4005e00cbdbf78d6a24f1797';

// Evaluated inside every catalogue SQL statement, not a cached JS OPEN boolean.
const verifiedOpenSql = `EXISTS (
  SELECT 1 FROM hk2_catalogue_publications p
  JOIN hk2_catalogue_publication_receipts r ON r.id=p.receipt_id
  WHERE p.semester='${GATED_SEMESTER}' AND p.state='OPEN' AND p.revision=1
    AND p.manifest_sha256='${HK2_MANIFEST}' AND p.payload_sha256='${HK2_PAYLOAD}'
    AND p.official_count=2357 AND p.batch_count=95
    AND length(p.verification_sha256)=64 AND p.verification_sha256=r.verification_sha256
    AND r.action='OPEN_HK2_2026_2027' AND r.owner_id=252552483 AND r.owner_comment_id>0
    AND length(r.backup_restore_sha256)=64 AND length(r.release_sha)=40
    AND p.opened_at=r.created_at
    AND (SELECT json_group_array(json_array(actor_scope,actor_id,idempotency_key,request_hash,operation,response_json,created_at))
      FROM (SELECT * FROM course_mutation_receipts WHERE actor_id='hk2-bulk-v1' ORDER BY actor_scope,idempotency_key)) IS r.import_ledger_json
    AND (SELECT COUNT(*) FROM course_schedules hc WHERE hc.semester='${GATED_SEMESTER}'
      AND hc.is_user_added IS NOT 1)=2357
    AND (SELECT COUNT(*) FROM course_schedules hc WHERE hc.semester='${GATED_SEMESTER}'
      AND hc.is_user_added IS NOT 1 AND hc.catalogue_visibility='published')=2357
)`;

const SQL_KEYWORDS = new Set(['WHERE','ON','LEFT','RIGHT','INNER','OUTER','CROSS','JOIN','GROUP','ORDER','LIMIT','OFFSET','UNION','HAVING','USING','RETURNING','SET']);
const wrappedBindings = new WeakMap<D1Database, { raw: D1Database; available: boolean }>();

/** Facet statements may share the verified gate inside one SQL statement. */
export const publicCatalogueFacetSql = (db: D1Database) => {
  const binding = wrappedBindings.get(db);
  if (!binding) throw new Error('Course facets require a public catalogue binding');
  const { raw, available } = binding;
  const gate = available ? `gate AS MATERIALIZED (SELECT CASE WHEN EXISTS (
    SELECT 1 FROM hk2_catalogue_publications
    WHERE semester='${GATED_SEMESTER}' AND state='OPEN'
  ) THEN ${verifiedOpenSql} ELSE 0 END AS is_open)` : '';
  return {
    db: raw,
    gate,
    source: `(SELECT * FROM course_filter_facets
      WHERE (semester IS NOT '${GATED_SEMESTER}' OR is_user_added=1${available ? ' OR (SELECT is_open FROM gate)' : ''})) AS course_filter_facets`,
    legacy: (sql: string) => rewritePublicCatalogueSql(sql, available),
  };
};

export const rewritePublicCatalogueSql = (sql: string, gateSchemaAvailable: boolean) => sql.replace(
  /\b(FROM|JOIN)\s+(course_schedules|course_filter_facets)\b/gi,
  (match, keyword: string, table: string, offset: number) => {
    const next = sql.slice(offset + match.length).match(/^\s+(?:AS\s+)?([A-Za-z_]\w*)/i);
    const alias = next && !SQL_KEYWORDS.has(next[1].toUpperCase()) ? '' : ` AS ${table}`;
    const predicate = `(semester IS NOT '${GATED_SEMESTER}' OR is_user_added=1${gateSchemaAvailable ? ` OR ${verifiedOpenSql}` : ''})`;
    return `${keyword} (SELECT * FROM ${table} WHERE ${predicate})${alias}`;
  },
);

export const publicCatalogueDb = async (db: D1Database, facetRead = false): Promise<D1Database> => {
  if (wrappedBindings.has(db)) return db;
  let available = false;
  try {
    const row = await db.prepare(`SELECT p.semester,p.state,p.revision,p.manifest_sha256,p.payload_sha256,
      p.official_count,p.batch_count,p.verification_sha256,p.opened_at,r.action,r.owner_id,
      r.owner_comment_id,r.verification_sha256,r.backup_restore_sha256,r.release_sha,r.import_ledger_json,r.created_at,
      l.actor_scope,l.actor_id,l.idempotency_key,l.request_hash,l.operation,l.response_json,l.created_at
      FROM hk2_catalogue_publications p
      LEFT JOIN hk2_catalogue_publication_receipts r ON r.id=p.receipt_id
      LEFT JOIN course_mutation_receipts l ON ${facetRead ? 'l.actor_scope = NULL' : '0'}
      WHERE p.semester='${GATED_SEMESTER}'`).first<{ semester: string }>();
    available = row?.semester === GATED_SEMESTER;
  } catch { /* missing/unverified migration is CLOSED; HK1 remains queryable */ }
  const wrapped = new Proxy(db, { get(target, property) {
    if (property === 'prepare') return (sql: string) => target.prepare(rewritePublicCatalogueSql(sql, available));
    const value = Reflect.get(target, property);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  wrappedBindings.set(wrapped, { raw: db, available });
  return wrapped;
};

/** Only explicitly scoped non-HK2 lists can use the old public edge cache. */
export const canCacheCourseRequest = (url: URL) => {
  const semesters = url.searchParams.getAll('semester').map(s=>s.trim()).filter(Boolean);
  return url.searchParams.get('resource')?.trim() !== 'course-detail'
    && semesters.length > 0 && semesters.every(s => s !== GATED_SEMESTER);
};
