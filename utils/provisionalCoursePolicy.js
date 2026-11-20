// Portable, explicit precision marker. Plain S/C retains its existing meaning.
// This label survives D1 TEXT fields and personal-schedule snapshots without
// relying on optional metadata being copied by every caller.
export const OWNER_ESTIMATED_RULE = 'HK2_OWNER_HALF_DAY_2026_11_20';
export const TEMPORARY_COURSE_LABEL = 'Mã lớp chưa công bố';

export const ownerEstimatedShiftLabel = (periods) => {
  if (!['1-2', '3-5'].includes(periods)) throw new Error('Owner rule does not authorize these periods');
  return `S (dự kiến theo owner, tiết ${periods})`;
};

export const getOwnerEstimatedShift = (value) => {
  for (const part of String(value || '').split(/[;\r\n]/)) {
    const match = part.trim().match(/^S \(dự kiến theo owner, tiết (1-2|3-5)\)$/i);
    if (match) return { shift: /** @type {'S'} */ ('S'), periods: match[1] };
  }
  return null;
};

export const ownerEstimatedShiftCaption = (value) => {
  const estimated = getOwnerEstimatedShift(value);
  return estimated ? `Ca Sáng dự kiến theo owner · tiết ${estimated.periods} · giờ chưa công bố` : '';
};

export const isTemporaryCatalogueItem = (item) => item?.record_kind === 'temporary_subject';

/** Preview-only view model. A technical ID is never an official course code. */
export const temporaryCatalogueView = (item) => {
  if (!isTemporaryCatalogueItem(item) || !item.technical_key || item.official_course_code !== null) throw new Error('Invalid temporary subject');
  return {
    record_kind: 'temporary_subject', technical_key: item.technical_key,
    semester: item.semester, subject_name: item.subject_name, course_code: null,
    code_label: TEMPORARY_COURSE_LABEL, credits: item.credits, instructor: null,
    credits_label: item.credits === null ? 'Tín chỉ chưa công bố' : `${item.credits} tín chỉ`,
    context_label: `Dòng nguồn ${item.provenance.source_row} · Chờ mã chính thức`,
    schedule_label: 'Chưa công bố lịch học cố định',
    day_of_week: null, shift: null, weeks: null, room: null, campus: null,
    selectable: false, can_add_to_personal_schedule: false, can_export_ics: false, can_check_conflicts: false,
  };
};

/** Search the separate review catalogue, never public official-code suggestions. */
export const searchTemporaryCatalogue = (items, query) => {
  const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase().trim();
  const term = normalize(query);
  return items.map(temporaryCatalogueView).filter(item => !term
    || normalize(`${item.subject_name} ${item.code_label} ${item.context_label}`).includes(term));
};
