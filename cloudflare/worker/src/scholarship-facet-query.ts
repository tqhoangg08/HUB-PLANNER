// Existing (batch_id, value) indexes can seek past duplicate labels. Probe a
// bounded number of labels, then use the Phase 1 DISTINCT for high cardinality.
// Only use this for an unfiltered facet scope, where MIN is a covering seek.
export const scholarshipFacetQuery = (from: string, column: string, seek: boolean) => {
  const distinct = `SELECT DISTINCT r.${column} AS value ${from} AND r.${column} IS NOT NULL AND r.${column}<>''`;
  const values = seek ? `WITH RECURSIVE facet_probe(value, step) AS (
    SELECT (SELECT MIN(r.${column}) ${from} AND r.${column}>''), 1
    UNION ALL
    SELECT (SELECT MIN(r.${column}) ${from} AND r.${column}>p.value), step+1
      FROM facet_probe p WHERE value IS NOT NULL AND step<16
  ), facet_values AS MATERIALIZED (
    SELECT value FROM facet_probe WHERE value IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM facet_probe WHERE step=16 AND value IS NOT NULL)
    UNION ALL
    ${distinct} AND EXISTS(SELECT 1 FROM facet_probe WHERE step=16 AND value IS NOT NULL)
  )` : `WITH facet_values AS MATERIALIZED (${distinct})`;
  return `${values}
    SELECT (SELECT COUNT(*) FROM facet_values) AS total,
      (SELECT json_group_array(value) FROM
        (SELECT value FROM facet_values ORDER BY value COLLATE BINARY LIMIT ? OFFSET ?)) AS optionsJson`;
};
