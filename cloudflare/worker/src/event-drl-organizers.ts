/** Custom organizer names are catalog additions, never authoritative rule data. */
export const recordEventDrlOrganizer = async (db: D1Database, rawName: unknown) => {
  if (typeof rawName !== 'string') return;
  const name = rawName.normalize('NFC').replace(/\s+/gu, ' ').trim().slice(0, 300);
  if (!name) return;
  const normalized = name.toLocaleLowerCase('vi-VN');
  await db.prepare(`INSERT OR IGNORE INTO event_organizers(name,name_normalized,source_version)
    VALUES (?,?,'custom')`).bind(name, normalized).run();
};
