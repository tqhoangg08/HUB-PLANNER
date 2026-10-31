import {readFileSync} from 'node:fs';

export const ANNOUNCEMENT_MIGRATION='0060_school_announcement_management.sql';
export const ANNOUNCEMENT_SCHEMA_QUERY="SELECT type,name,sql FROM sqlite_schema WHERE tbl_name IN ('school_announcements','school_announcement_push_queue','announcement_id_sequence') AND sql IS NOT NULL ORDER BY type,name";
export const ANNOUNCEMENT_LEDGER_QUERY=`SELECT name FROM d1_migrations WHERE name='${ANNOUNCEMENT_MIGRATION}'`;
// Reviewed schema contract built from repository migrations, never a production
// data dump. The release gate only reads sqlite_schema and the migration ledger.
const contract=JSON.parse(readFileSync(new URL('./announcement-release-schema.json',import.meta.url),'utf8'));
const canonicalSql=sql=>sql.trim().replace(/;$/,'')
  .replace(/'(?:''|[^'])*'|"(?:""|[^"])*"|`[^`]*`|\[[^\]]*\]|\s+/g,part=>/^\s+$/.test(part)?'':part);

export function validateAnnouncementReleaseSchema(objects,ledger){
  if(!Array.isArray(ledger)||ledger.length!==1||ledger[0]?.name!==ANNOUNCEMENT_MIGRATION)
    throw Error('ANNOUNCEMENT_0060_MIGRATION_LEDGER_REQUIRED');
  if(!Array.isArray(objects)||objects.length!==contract.length)
    throw Error('ANNOUNCEMENT_0060_SCHEMA_DRIFT');
  for(const expected of contract){
    const found=objects.filter(object=>object?.type===expected.type&&object.name===expected.name);
    if(found.length!==1||typeof found[0].sql!=='string'||canonicalSql(found[0].sql)!==canonicalSql(expected.sql))
      throw Error('ANNOUNCEMENT_0060_SCHEMA_DRIFT');
  }
  return true;
}
