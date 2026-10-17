import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ExcelJS from 'exceljs';
import { zipSync, strToU8 } from 'fflate';
import { parseScholarshipFile, checkScholarshipZip } from '../scripts/scholarship-workbook.mjs';
import { scholarshipSha256 } from '../shared/scholarship-import.ts';
import { syntheticEligibility } from './fixtures/scholarship-eligibility.ts';
import { eligibilityMapping } from '../shared/scholarship-eligibility.ts';
const mapping = { studentCode: 'MSSV', fullName: 'Name', awardType: 'Award', scores: [{ key: 'sourceScore', column: 'Score', label: 'Official source score' }] };
const temporary = async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'hub-scholarship-synthetic-'));
  t.after(() => rm(dir, { recursive: true, force: true })); return dir;
};

test('1059 row 17-column XLSX and explicit formula-cache opt-in retain all source values without evaluating formulas', async t => {
  const dir=await temporary(t), file=path.join(dir,'synthetic-17.xlsx');
  const data=syntheticEligibility(), headers=Object.keys(data.rows[0].values);
  const wb=new ExcelJS.Workbook(), sheet=wb.addWorksheet('DS SV');
  sheet.addRow(headers); for(const row of data.rows) sheet.addRow(headers.map(key=>row.values[key]));
  sheet.getCell('F2').value={formula:'"K23"',result:'K23'};
  sheet.getCell('M2').value={formula:'1/80',result:0.0125};
  await wb.xlsx.writeFile(file);
  await assert.rejects(parseScholarshipFile(file,eligibilityMapping,{sheetName:'DS SV'}),/UNSUPPORTED_XLSX_CELL/);
  const result=await parseScholarshipFile(file,eligibilityMapping,{sheetName:'DS SV',allowCachedFormulas:true});
  assert.equal(result.validation.valid,true);assert.equal(result.validation.acceptedRows,1059);
  assert.deepEqual(result.payload.rows,data.rows);assert.equal(result.payload.mapping.sourceListKind,'eligibility');
  sheet.getCell('M2').value={formula:'1/80'};await wb.xlsx.writeFile(file);
  await assert.rejects(parseScholarshipFile(file,eligibilityMapping,{sheetName:'DS SV',allowCachedFormulas:true}),/UNSUPPORTED_XLSX_CELL/);
  sheet.getCell('M2').value={formula:'1/80',result:{error:'#VALUE!'}};await wb.xlsx.writeFile(file);
  await assert.rejects(parseScholarshipFile(file,eligibilityMapping,{sheetName:'DS SV',allowCachedFormulas:true}),/UNSUPPORTED_XLSX_CELL/);
});
test('CSV checksum/text code, quoted fields, explicit mapping and private CLI output', async t => {
  const dir = await temporary(t), file = path.join(dir, 'synthetic.csv');
  const source = '\uFEFFMSSV,Name,Award,Score\r\n000000000001,"Synthetic, Student",Award,"9,5"\r\n';
  await writeFile(file, source);
  const result = await parseScholarshipFile(file, mapping);
  assert.equal(result.validation.valid, true); assert.equal(result.payload.rows[0].values.MSSV, '000000000001');
  assert.equal(result.payload.rows[0].values.Score, '9,5');
  assert.equal(result.payload.sourceSha256, await scholarshipSha256(await readFile(file)));
  const mappingFile = path.join(dir, 'mapping.json'), output = path.join(dir, 'private.json');
  await writeFile(mappingFile, JSON.stringify(mapping));
  const cli = spawnSync(process.execPath, ['scripts/prepare-scholarship-import.mjs', '--file', file, '--mapping', mappingFile, '--output', output], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr); assert.doesNotMatch(cli.stdout, /000000000001|Synthetic, Student/);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).sourceSha256, result.payload.sourceSha256);
  const retry = spawnSync(process.execPath, ['scripts/prepare-scholarship-import.mjs', '--file', file, '--mapping', mappingFile, '--output', output], { encoding: 'utf8' });
  assert.equal(retry.status, 1); // Never overwrite an existing private export.
});
test('CSV rejects corrupt quotes, duplicate headers, missing columns, invalid encoding and internal blanks', async t => {
  const dir = await temporary(t), file = path.join(dir, 'synthetic.csv');
  for (const source of ['MSSV,Name,Award,Score\n"broken', 'MSSV,Name,Name,Score\n1,a,b,1',
    'MSSV,Name,Award,Score\n000000000001,A,B', 'MSSV,Name,Award,Score\n\n000000000001,A,B,1\n']) {
    await writeFile(file, source); await assert.rejects(parseScholarshipFile(file, mapping));
  }
  await writeFile(file, Buffer.from([0xff, 0xff])); await assert.rejects(parseScholarshipFile(file, mapping), /CSV_UTF8_REQUIRED/);
});
test('CSV semicolon parsing and source row order are explicit; numeric scales are never guessed', async t => {
  const dir = await temporary(t), file = path.join(dir, 'synthetic.csv');
  await writeFile(file, 'MSSV;Name;Award;Score\n000000000001;A;B;250\n');
  const result = await parseScholarshipFile(file, mapping, { delimiter: ';' });
  assert.equal(result.validation.valid, true); assert.equal(result.payload.rows[0].sourceRowNumber, 2);
  assert.equal(result.payload.rows[0].values.Score, '250');
});
test('XLSX preserves row positions, requires sheet selection and rejects formula/numeric-code assumptions', async t => {
  const dir = await temporary(t), file = path.join(dir, 'synthetic.xlsx');
  const wb = new ExcelJS.Workbook(), sheet = wb.addWorksheet('Awards');
  sheet.addRow(['MSSV', 'Name', 'Award', 'Score']); sheet.getRow(3).values = ['000000000001', 'A', 'B', 250];
  await wb.xlsx.writeFile(file);
  const result = await parseScholarshipFile(file, mapping);
  assert.equal(result.validation.valid, true); assert.equal(result.payload.rows[0].sourceRowNumber, 3);
  sheet.getCell('D3').value = { formula: '1+1', result: 2 }; await wb.xlsx.writeFile(file);
  await assert.rejects(parseScholarshipFile(file, mapping), /UNSUPPORTED_XLSX_CELL/);
  sheet.getCell('D3').value = 2; sheet.getCell('A3').value = 1; await wb.xlsx.writeFile(file);
  assert.equal((await parseScholarshipFile(file, mapping)).validation.valid, false);
  wb.addWorksheet('Other'); await wb.xlsx.writeFile(file);
  await assert.rejects(parseScholarshipFile(file, mapping), /EXPLICIT_SHEET_REQUIRED/);
});
test('bounded parser rejects oversized source/row count, unsupported extension and decompression bombs', async t => {
  const dir = await temporary(t), file = path.join(dir, 'synthetic.csv');
  await writeFile(file, 'x'.repeat(4 * 1024 * 1024 + 1)); await assert.rejects(parseScholarshipFile(file, mapping), /SOURCE_TOO_LARGE/);
  await writeFile(file, 'MSSV,Name,Award,Score\n' + '000000000001,A,B,1\n'.repeat(2001));
  await assert.rejects(parseScholarshipFile(file, mapping), /CORRUPT_OR_OVERSIZED_CSV/);
  assert.throws(() => checkScholarshipZip(Buffer.from('corrupt')), /INVALID_XLSX_ZIP/);
  const zip = zipSync({ '[Content_Types].xml': strToU8('ok'), 'xl/workbook.xml': strToU8('x'.repeat(200000)) });
  assert.throws(() => checkScholarshipZip(Buffer.from(zip)), /XLSX_EXPANSION_LIMIT/);
  const damaged = Buffer.from(zipSync({ '[Content_Types].xml': strToU8('ok'), 'xl/workbook.xml': strToU8('ok') }));
  const central = damaged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  damaged[central + 16] ^= 1;
  assert.throws(() => checkScholarshipZip(damaged), /CORRUPT_XLSX_MEMBER/);
});

test('offline CSV and XLSX retain separate program/rank/cohort source mappings', async t => {
  const dir=await temporary(t), custom={...mapping,scholarshipType:'Program',scholarshipRank:'Rank',cohort:'Cohort'};
  const columns=['MSSV','Name','Award','Score','Program','Rank','Cohort'];
  const cells=['000000000001','Synthetic','Legacy',9.5,'Khuyến khích học tập','Giỏi','K24'];
  const csv=path.join(dir,'extended.csv');await writeFile(csv,columns.join(',')+'\n'+cells.join(',')+'\n');
  const wb=new ExcelJS.Workbook();const sheet=wb.addWorksheet('Awards');sheet.addRow(columns);sheet.addRow(cells);const xlsx=path.join(dir,'extended.xlsx');await wb.xlsx.writeFile(xlsx);
  for(const file of [csv,xlsx]) { const result=await parseScholarshipFile(file,custom); assert.equal(result.validation.valid,true);assert.equal(result.payload.mapping.scholarshipType,'Program');assert.equal(result.payload.rows[0].values.Rank,'Giỏi');assert.equal(result.payload.rows[0].values.Cohort,'K24'); }
});
