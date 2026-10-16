import {readFileSync} from 'node:fs';

export const SCHOLARSHIP_MIGRATIONS=Object.freeze([
  '0055_scholarships.sql','0056_scholarship_snapshots.sql','0057_scholarship_filters.sql',
]);
export const SCHOLARSHIP_SCHEMA_QUERY="SELECT type,name,sql FROM sqlite_schema WHERE name GLOB 'scholarship_*' ORDER BY type,name";
// Reviewed final schema contract, not a database dump. Tests build the immutable
// migrations in memory and compare this contract; the release reader executes no DDL.
const contract=JSON.parse(readFileSync(new URL('./scholarship-release-schema.json',import.meta.url),'utf8'));
export const canonicalScholarshipSql=sql=>String(sql).trim().replace(/;$/,'')
  .replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|\s+/g,part=>/^\s+$/.test(part)?'':part);

export function validateScholarshipReleaseSchema(objects,ledger){
  if(!Array.isArray(ledger)||SCHOLARSHIP_MIGRATIONS.some(name=>ledger.filter(r=>r?.name===name).length!==1))
    throw Error('SCHOLARSHIP_MIGRATION_LEDGER_REQUIRED');
  if(!Array.isArray(objects)||objects.length!==contract.length)throw Error('SCHOLARSHIP_SCHEMA_DRIFT');
  for(const expected of contract){
    const found=objects.filter(o=>o?.type===expected.type&&o.name===expected.name);
    if(found.length!==1||typeof found[0].sql!=='string'||canonicalScholarshipSql(found[0].sql)!==canonicalScholarshipSql(expected.sql))
      throw Error('SCHOLARSHIP_SCHEMA_DRIFT');
  }
  return true;
}
