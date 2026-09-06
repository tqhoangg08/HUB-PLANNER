// Paste this entire file into Chrome DevTools > Sources > Snippets on HUB Portal.
// Input accepts strings or { canonical_course_code, instructor, normalized_schedule }.
// normalized_schedule uses the same array shape as normalized_upstream_schedule below.
(() => {
  const COURSE_CODES = [ /* canonical HUB Planner codes */ ];
  const PASTED_JSON = ''; // Optional JSON array; takes precedence over COURSE_CODES.
  const TERM = { academic_year: '2026-2027', semester: 'HK1', term_id: 'HK01' };
  const VERSION = '1.0.0';
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const label = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
  // Only surrounding whitespace is normalized for identity. No substring matching.
  const identity = value => String(value ?? '').trim();
  function generateRosterCandidates(code) {
    const parts = identity(code).split('_');
    const aliases = [];
    if (parts.length >= 3 && parts.every(Boolean)) {
      const [p0, p1, ...rest] = parts;
      for (const n of [1, 2]) {
        aliases.push(`${p0}_${p1}_${n}_${rest.join('_')}`);
        if (!p0.startsWith('GYM')) aliases.push(`${p0}_${p1}${n}_${n}_${rest.join('_')}`);
      }
    }
    // GYM never discards middle segments. Variant 3 has no supporting evidence.
    aliases.push(identity(code));
    return [...new Set(aliases)];
  }
  const exactMatch = (code, aliases) => aliases.some(alias => identity(alias) === identity(code));
  const cells = row => [...row.children].filter(cell => /^(TD|TH)$/.test(cell.tagName));
  const ownedRows = table => [...table.querySelectorAll('tr')].filter(row => row.closest('table') === table);
  const idValue = value => /^\d{8,15}$/.test(String(value ?? '').trim()) ? String(value).trim() : null;
  function parseRoster(doc) {
    const candidates = [];
    for (const table of doc.querySelectorAll('table')) {
      const rows = ownedRows(table);
      const header = rows.find(row => cells(row).some(cell => /^(mssv|ma (so )?sinh vien|student id)$/.test(label(cell.textContent))));
      if (!header) continue;
      const column = cells(header).findIndex(cell => /^(mssv|ma (so )?sinh vien|student id)$/.test(label(cell.textContent)));
      const identifiers = [];
      let dataRows = 0;
      for (const row of rows) {
        if (row === header) continue;
        const cell = cells(row)[column];
        if (!cell || cell.querySelector('table')) continue;
        const values = [cell.textContent, ...[...cell.querySelectorAll('input')].map(input => input.value)];
        for (const link of cell.querySelectorAll('a[href]')) {
          try { values.push(new URL(link.getAttribute('href'), 'https://online.hub.edu.vn/').searchParams.get('StudentID')); } catch { /* ignore malformed link */ }
        }
        const id = values.map(idValue).find(Boolean);
        if (id) { dataRows++; if (!identifiers.includes(id)) identifiers.push(id); }
      }
      candidates.push({ dataRows, identifiers: identifiers.slice(0, 3), found: true });
    }
    return candidates.sort((a, b) => b.dataRows - a.dataRows)[0] || { found: false, dataRows: 0, identifiers: [] };
  }
  const fields = {
    code: /^(ma (lop|lop hoc phan|hoc phan)|lop hoc phan|class code|course code)$/,
    course_name: /^(ten (mon hoc|hoc phan)|mon hoc|hoc phan|course name)$/,
    instructor: /^(giang vien|giao vien|ten giang vien|gv)$/,
    weekday: /^(thu|ngay hoc)$/,
    periods: /^(tiet|tiet hoc|tu tiet|tiet bat dau)$/,
    time: /^(gio|gio hoc|thoi gian)$/,
    room: /^(phong|phong hoc|dia diem)$/,
    start_date: /^(tu ngay|ngay bat dau)$/,
    end_date: /^(den ngay|ngay ket thuc)$/,
    range: /^(tuan|tuan hoc|thoi gian hoc|lich hoc)$/,
  };
  function parseTimetable(doc) {
    const result = [];
    let recognized = false;
    for (const table of doc.querySelectorAll('table')) {
      const rows = ownedRows(table);
      const headerIndex = rows.findIndex(row => cells(row).some(cell => fields.code.test(label(cell.textContent))));
      if (headerIndex < 0) continue;
      const headers = cells(rows[headerIndex]).map(cell => label(cell.textContent));
      const indexes = Object.fromEntries(Object.entries(fields).map(([key, rule]) => [key, headers.findIndex(text => rule.test(text))]));
      recognized = true;
      // Expand rowspan cells within this table; never consume an outer layout table.
      const spans = new Map();
      for (const row of rows.slice(headerIndex + 1)) {
        const grid = [];
        for (const [column, span] of spans) {
          grid[column] = span.text;
          if (--span.remaining === 0) spans.delete(column);
        }
        let column = 0;
        for (const cell of cells(row)) {
          while (grid[column] !== undefined) column++;
          const text = clean(cell.textContent);
          grid[column] = text;
          if (cell.rowSpan > 1) spans.set(column, { text, remaining: cell.rowSpan - 1 });
          column += Math.max(1, cell.colSpan);
        }
        const code = identity(grid[indexes.code]);
        if (!code || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(code)) continue;
        const record = Object.fromEntries(Object.keys(fields).map(key => [key, indexes[key] >= 0 ? clean(grid[indexes[key]]) : '']));
        record.code = code;
        if (/^(chua xep gv|lop huy\/trong)$/i.test(label(record.instructor))) record.instructor = '';
        result.push(record);
      }
    }
    return { recognized, rows: result };
  }
  function scheduleOf(rows) {
    const schedule = rows.map(row => Object.fromEntries(['weekday', 'periods', 'time', 'room', 'start_date', 'end_date', 'range'].map(key => [key, clean(row[key])])));
    return [...new Map(schedule.map(row => [JSON.stringify(row), row])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  const meaningful = schedule => schedule.some(row => Object.values(row).some(Boolean));
  function decide(evidence, reference = {}) {
    const valid = evidence.filter(item => meaningful(item.schedule));
    if (!valid.length) return { verification_status: 'UNRESOLVED', proposed_action: 'UNRESOLVED', confidence: 0, normalized_upstream_schedule: [], instructor: '' };
    const groups = new Map();
    for (const item of valid) {
      const key = JSON.stringify(item.schedule);
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    const ranked = [...groups.values()].sort((a, b) => b.length - a.length);
    const winner = ranked[0];
    const same = Array.isArray(reference.normalized_schedule) && JSON.stringify(scheduleOf(reference.normalized_schedule)) === JSON.stringify(winner[0].schedule);
    if ((ranked.length > 1 && winner.length < 2) || (!same && winner.length < 2)) {
      return { verification_status: ranked.length > 1 ? 'CONFLICT' : 'UNRESOLVED', proposed_action: ranked.length > 1 ? 'CONFLICT' : 'UNRESOLVED', confidence: 0, normalized_upstream_schedule: [], instructor: '' };
    }
    const instructors = [...new Set(winner.map(item => item.instructor).filter(Boolean))];
    if (instructors.length > 1) return { verification_status: 'CONFLICT', proposed_action: 'CONFLICT', confidence: 0, normalized_upstream_schedule: [], instructor: '' };
    const instructor = instructors[0] || '';
    return {
      verification_status: 'RESOLVED',
      proposed_action: same ? (!clean(reference.instructor) && instructor ? 'FILL_INSTRUCTOR' : 'KEEP') : 'REVIEW_SCHEDULE',
      confidence: winner.length / Math.max(2, evidence.length),
      normalized_upstream_schedule: winner[0].schedule,
      instructor,
    };
  }
  const loginDocument = doc => Boolean(doc.querySelector('input[type="password"], input[name$="txtUserName"]'));
  async function run() {
    if (location.origin !== 'https://online.hub.edu.vn') { console.error('Mở snippet trên https://online.hub.edu.vn/'); return; }
    if (globalThis.__hubHk1AuditRunning) { console.warn('Một lần thu thập đang chạy.'); return; }
    let input;
    try { input = PASTED_JSON.trim() ? JSON.parse(PASTED_JSON) : COURSE_CODES; } catch { console.error('Danh sách JSON không hợp lệ.'); return; }
    if (!Array.isArray(input) || !input.length) { console.warn('Điền COURSE_CODES hoặc PASTED_JSON trước khi chạy.'); return; }
    if (input.some(item => !identity(typeof item === 'string' ? item : item?.canonical_course_code))) { console.error('Thiếu canonical_course_code.'); return; }
    globalThis.__hubHk1AuditRunning = true;
    let requests = 0;
    let cacheHits = 0;
    const cache = new Map(); // Student identifiers remain in this closure only.
    const courses = [];
    const get = async url => {
      await new Promise(resolve => setTimeout(resolve, 550));
      requests++;
      let response;
      try { response = await fetch(url, { credentials: 'include', signal: AbortSignal.timeout(30000) }); }
      catch { throw new Error('UPSTREAM_ERROR'); }
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (/\/(default|login)\.aspx$/i.test(new URL(response.url).pathname) || loginDocument(doc)) throw new Error('HUB_SESSION_EXPIRED');
      if (!response.ok) throw new Error('UPSTREAM_ERROR');
      return doc;
    };
    try {
      for (const item of input) {
        const reference = typeof item === 'string' ? { canonical_course_code: item } : item;
        const canonical = reference.canonical_course_code;
        const aliases = generateRosterCandidates(canonical);
        const course = { canonical_course_code: canonical, matched_roster_alias: null, roster_candidates_tried: [], roster_status: 'UNRESOLVED', student_candidates_found: 0, timetable_candidates_checked: 0, matched_timetable_class_code: null, normalized_upstream_schedule: [], instructor: '', verification_status: 'UNRESOLVED', proposed_action: 'UNRESOLVED', confidence: 0, warnings: [] };
        courses.push(course);
        try {
          let roster;
          for (const alias of aliases) {
            course.roster_candidates_tried.push(alias);
            const url = new URL('/Liststudentinschedulestudyunit.aspx', location.origin);
            url.searchParams.set('SchduleStudyUnitId', alias);
            const parsed = parseRoster(await get(url));
            if (parsed.found) {
              roster = parsed; course.matched_roster_alias = alias;
              break;
            }
          }
          if (!roster) { course.warnings.push('ROSTER_TABLE_NOT_RECOGNIZED'); continue; }
          course.student_candidates_found = roster.identifiers.length;
          course.roster_status = roster.identifiers.length ? 'RESOLVED' : 'EMPTY_ROSTER';
          if (!roster.identifiers.length) { course.verification_status = course.proposed_action = 'EMPTY_ROSTER'; continue; }
          const evidence = [];
          for (const student of roster.identifiers) {
            course.timetable_candidates_checked++;
            let timetable = cache.get(student);
            if (timetable) cacheHits++;
            else {
              const url = new URL('/Print_.aspx', location.origin);
              url.searchParams.set('NH', TERM.academic_year); url.searchParams.set('HK', TERM.term_id); url.searchParams.set('StudentID', student);
              timetable = parseTimetable(await get(url)); cache.set(student, timetable);
            }
            if (!timetable.recognized) { course.warnings.push('TIMETABLE_TABLE_NOT_RECOGNIZED'); continue; }
            if (!timetable.rows.length) { course.warnings.push('EMPTY_VALID_TIMETABLE'); continue; }
            const matches = timetable.rows.filter(row => exactMatch(row.code, aliases));
            if (!matches.length) { course.warnings.push('NO_MATCHING_TIMETABLE_CLASS'); continue; }
            course.matched_timetable_class_code = matches[0].code;
            const names = [...new Set(matches.map(row => row.instructor).filter(Boolean))];
            if (names.length > 1) { course.warnings.push('INSTRUCTOR_CONFLICT'); continue; }
            evidence.push({ schedule: scheduleOf(matches), instructor: names[0] || '' });
          }
          Object.assign(course, decide(evidence, reference));
          course.warnings = [...new Set(course.warnings)];
        } catch (error) {
          if (error.message === 'HUB_SESSION_EXPIRED') { course.verification_status = course.proposed_action = 'SESSION_EXPIRED'; console.warn('HUB_SESSION_EXPIRED'); break; }
          course.verification_status = course.proposed_action = 'UPSTREAM_ERROR';
        }
      }
      const summary = { courses: courses.length, upstream_requests: requests, cache_hits: cacheHits };
      for (const course of courses) summary[course.verification_status] = (summary[course.verification_status] || 0) + 1;
      const output = { metadata: { ...TERM, generated_at: new Date().toISOString(), snippet_version: VERSION }, summary, courses };
      console.table(courses.map(course => ({ canonical_course_code: course.canonical_course_code, status: course.verification_status, action: course.proposed_action, checked: course.timetable_candidates_checked })));
      console.log(summary);
      const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `hub-hk1-2026-2027-schedule-audit-${Date.now()}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } finally { cache.clear(); globalThis.__hubHk1AuditRunning = false; }
  }
  void run();
})();

