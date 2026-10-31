import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {ANNOUNCEMENT_MIGRATION,ANNOUNCEMENT_SCHEMA_QUERY} from '../scripts/announcement-release-schema.mjs';

export function announcementReleaseFixture(include0060=true){
  const db=new DatabaseSync(':memory:');
  try{
    for(const name of ['0001_create_school_announcements.sql','0023_create_event_push_deliveries.sql','0024_create_native_push_runtime.sql','0025_announcement_d1_authority.sql','0033_reduce_push_delivery_write_amplification.sql',...(include0060?[ANNOUNCEMENT_MIGRATION]:[])]){
      if(name.startsWith('0025'))db.exec('ALTER TABLE sync_metadata ADD COLUMN visible_row_count INTEGER; ALTER TABLE sync_metadata ADD COLUMN source_cursor TEXT;');
      db.exec(readFileSync(`cloudflare/migrations/${name}`,'utf8'));
    }
    return {objects:db.prepare(ANNOUNCEMENT_SCHEMA_QUERY).all(),ledger:include0060?[{name:ANNOUNCEMENT_MIGRATION}]:[]};
  }finally{db.close();}
}
