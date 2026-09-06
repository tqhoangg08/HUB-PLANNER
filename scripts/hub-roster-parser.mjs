import { load } from 'cheerio';

const studentIdentifier = (value) => {
  const normalized = String(value || '').replace(/\u00a0/g, ' ').trim();
  return /^\d{8,15}$/.test(normalized) ? normalized : null;
};

const identifierFromHref = (href) => {
  try {
    const value = new URL(href, 'https://online.hub.edu.vn/').searchParams.get('StudentID');
    return studentIdentifier(value);
  } catch {
    return null;
  }
};

const structuralRow = ($, row) => {
  const cells = $(row).children('td');
  const controls = $(row).find('input,select,textarea');
  const links = $(row).find('a[href]');
  const attributeNames = new Set();
  $(row).find('*').each((_index, element) => {
    for (const name of Object.keys(element.attribs || {})) attributeNames.add(name.toLowerCase());
  });
  return {
    cellCount: cells.length,
    controlCount: controls.length,
    linkCount: links.length,
    textCellCount: cells.toArray().filter((cell) => Boolean($(cell).text().trim())).length,
    attributeNames: [...attributeNames].sort(),
  };
};

const directRows = ($, table) => $(table).children('tr').add($(table).children('thead,tbody,tfoot').children('tr')).toArray();
const mssvHeader = (value) => /\bMSSV\b|Mã\s*(?:số\s*)?sinh\s*viên|student\s*(?:id|code)/i.test(value);
const rosterHeaderRows = ($, rows) => rows.filter((row) => {
  const cellText = $(row).children('th,td').toArray().map((cell) => $(cell).text().replace(/\u00a0/g, ' ').trim()).join(' ');
  return mssvHeader(cellText);
});

const collectIdentifiers = ($, rows) => {
  const identifiers = [];
  const sources = new Map();
  const add = (value, sourceClass) => {
    const identifier = studentIdentifier(value);
    if (!identifier || identifiers.includes(identifier)) return;
    identifiers.push(identifier);
    sources.set(identifier, sourceClass);
  };
  for (const row of rows) {
    const cells = $(row).children('td');
    cells.each((_cellIndex, cell) => add($(cell).text(), 'td_text'));
    $(row).find('input[type="hidden"]').each((_inputIndex, input) => add($(input).attr('value'), 'hidden_input'));
    $(row).find('input:not([type="hidden"])').each((_inputIndex, input) => add($(input).val(), 'input'));
    $(row).find('a[href]').each((_linkIndex, link) => add(identifierFromHref($(link).attr('href')), 'link'));
    $(row).find('[data-student-id],[data-mssv]').each((_attributeIndex, element) => {
      add($(element).attr('data-student-id') || $(element).attr('data-mssv'), 'attribute');
    });
  }
  return { identifiers, sources };
};

// Select a semantically roster-shaped nested table. This deliberately ignores
// outer layout tables, including rows that only wrap an inner data table.
export const parseHk1RosterStudents = (html) => {
  const $ = load(html);
  const candidates = $('table').toArray().map((table) => {
    const rows = directRows($, table);
    const headerRows = rosterHeaderRows($, rows);
    const dataRows = rows.filter((row) => $(row).children('td').length >= 2);
    const collected = collectIdentifiers($, dataRows);
    return {
      rows,
      dataRows,
      headerRows,
      hasMssvHeader: headerRows.length > 0,
      identifiers: collected.identifiers,
      sources: collected.sources,
    };
  });
  const dataTables = candidates.filter((candidate) => candidate.dataRows.length > 0 && (candidate.hasMssvHeader || candidate.identifiers.length > 0));
  const score = (candidate) => (candidate.hasMssvHeader ? 1000 : 0) + candidate.identifiers.length * 100 + candidate.dataRows.length;
  const roster = dataTables.sort((left, right) => score(right) - score(left))[0];
  const identifiers = roster?.identifiers.slice(0, 3) || [];
  const structuralRows = roster?.dataRows.map((row) => structuralRow($, row)) || [];
  const headerRow = roster?.headerRows[0];

  return {
    rowCount: structuralRows.length,
    identifiers,
    sourceClass: identifiers[0] ? roster.sources.get(identifiers[0]) || 'other' : 'other',
    structuralRows,
    tableCount: candidates.length,
    candidateDataTableCount: dataTables.length,
    realRosterTableFound: Boolean(roster?.hasMssvHeader),
    headerCellCount: headerRow ? $(headerRow).children('th,td').length : 0,
  };
};

