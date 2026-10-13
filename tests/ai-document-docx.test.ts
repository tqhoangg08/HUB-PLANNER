import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {zipSync,strToU8} from 'fflate';
import {extractNativeDocx,prepareNativeDocx,DOCX_NATIVE_PIPELINE} from '../cloudflare/worker/src/ai-document-docx.ts';
import {normalizeAuthorizedAiSearchChunks} from '../cloudflare/worker/src/ai-search-retrieval.ts';
import {buildCompletenessDependencies} from '../cloudflare/worker/src/ai-advisor-completeness-config.ts';
import {buildDerivedPageObjectKey} from '../cloudflare/worker/src/ai-document-ingestion.ts';
import {buildEvidenceRetrievalPlan} from '../cloudflare/worker/src/ai-advisor-retrieval-plan.ts';
import {extractOfficialDocumentLocators} from '../cloudflare/worker/src/gemini-file-search.ts';
import {resolveConductTableAnswer} from '../cloudflare/worker/src/ai-advisor-table-evidence.ts';
import {resolveAcademicMilestone,resolvePolicyArticleExcerpt,resolveTuitionTableRow} from '../cloudflare/worker/src/ai-advisor-source-sections.ts';
import {Miniflare} from 'miniflare';
import {storeDerivedPdfPages} from '../cloudflare/worker/src/ai-document-ingestion.ts';
const DOC='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const wrap=(body:string)=>`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
const archive=(body:string,other:Record<string,Uint8Array>={})=>zipSync({'word/document.xml':strToU8(wrap(body)),...other});
const p=(text:string)=>`<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
const cell=(text:string,props='')=>`<w:tc><w:tcPr>${props}</w:tcPr>${p(text)}</w:tc>`;
const table=(rows:string)=>`<w:tbl><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid>${rows}</w:tbl>`;

test('malformed ZIP64 without its extra field rejects instead of hanging the native DOCX parser',()=>{
  // GHSA-px8p-9vwx-vf98: streaming Unzip shares the vulnerable ZIP64 reader.
  // An isolated process with a timeout makes the regression safe on old versions.
  const name=Buffer.from('word/document.xml'),bytes=Buffer.alloc(31+name.length);
  bytes.writeUInt32LE(0x04034b50,0);bytes.writeUInt16LE(45,4);
  bytes.writeUInt32LE(0xffffffff,18);bytes.writeUInt32LE(0xffffffff,22);
  bytes.writeUInt16LE(name.length,26);name.copy(bytes,30);
  const result=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',
    `import{extractNativeDocx,DocxExtractionError}from './cloudflare/worker/src/ai-document-docx.ts';try{extractNativeDocx(Buffer.from('${bytes.toString('hex')}','hex'));process.exitCode=1;}catch(e){if(!(e instanceof DocxExtractionError))process.exitCode=2;}`],
    {timeout:2500,encoding:'utf8'});
  assert.equal(result.error,undefined,'parser must terminate on malformed ZIP64');
  assert.equal(result.status,0,'malformed archive must be rejected safely');
});
test('native Word preserves Vietnamese, literal numbering, dates, amounts and split runs without OCR or invented pages',()=>{
  const result=extractNativeDocx(archive(p('Điều 3. Quy định')+'<w:p><w:r><w:t>25.600.</w:t></w:r><w:r><w:t>000 đồng/năm</w:t></w:r></w:p>'+p('1. Ngày 07/10/2026; 747.000 đồng/tín chỉ.')));
  assert.equal(result.ocrUsed,false);assert.equal(result.pipelineVersion,DOCX_NATIVE_PIPELINE);
  assert.match(result.markdown,/25\.600\.000 đồng\/năm/);assert.match(result.markdown,/747\.000 đồng\/tín chỉ/);
  assert.match(result.markdown,/Điều 3\. Quy định/);assert.match(result.markdown,/1\. Ngày 07\/10\/2026/);
  assert.match(result.markdown,/<!-- word_unit: 1 -->/);assert.doesNotMatch(result.markdown,/<!-- page:|## Trang/);
});
test('native Word keeps table cell associations and explicitly declared vertical merges',()=>{
  const rows='<w:tr>'+cell('Ngành')+cell('Học phí')+'</w:tr><w:tr>'+cell('Tài chính – Ngân hàng','<w:vMerge w:val="restart"/>')+cell('25.600.000')+'</w:tr><w:tr>'+cell('','<w:vMerge/>')+cell('747.000')+'</w:tr>';
  const result=extractNativeDocx(archive(table(rows)));
  assert.match(result.markdown,/\| Tài chính – Ngân hàng \| 25\.600\.000 \|/);
  assert.match(result.markdown,/\| Tài chính – Ngân hàng \| 747\.000 \|/);
  assert.equal(result.counts.tableRows,3);assert.match(result.markdown,/Bảng 1 \(thứ tự bảng trong DOCX\)/);
});

test('standard/TABP plan repeated continuation text is accepted only when exactly equal to merge origin',()=>{
  const rows='<w:tr>'+cell('Chương trình','<w:vMerge w:val="restart"/>')+cell('01/09/2026')+'</w:tr><w:tr>'+cell('Chương trình','<w:vMerge/>')+cell('02/09/2026')+'</w:tr>';
  const result=extractNativeDocx(archive(table(rows)));
  assert.equal(result.counts.tableRows,2);assert.match(result.markdown,/02\/09\/2026/);
  assert.throws(()=>extractNativeDocx(archive(table(rows.replace('Chương trình</w:t></w:r></w:p></w:tc><w:tc><w:tcPr></w:tcPr><w:p><w:r><w:t>02','Chương trình khác</w:t></w:r></w:p></w:tc><w:tc><w:tcPr></w:tcPr><w:p><w:r><w:t>02')))),/MERGE_CONFLICT/);
});

const numberXml=(format='bullet',label='●',start='1')=>`<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="7"><w:lvl w:ilvl="0"><w:start w:val="${start}"/><w:numFmt w:val="${format}"/><w:lvlText w:val="${label}"/></w:lvl></w:abstractNum><w:num w:numId="2"><w:abstractNumId w:val="7"/></w:num></w:numbering>`;
const numbered=(text:string)=>`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
test('TABP/tuition OOXML bullets and decimal start labels use actual numbering, missing definitions still reject',()=>{
  const body=numbered('Ngày 01/09/2026')+numbered('747.000 đồng');
  assert.match(extractNativeDocx(archive(body,{'word/numbering.xml':strToU8(numberXml())})).markdown,/● Ngày/);
  const decimal=extractNativeDocx(archive(body,{'word/numbering.xml':strToU8(numberXml('decimal','%1.','4'))})).markdown;
  assert.match(decimal,/4\. Ngày/);assert.match(decimal,/5\. 747\.000/);
  assert.throws(()=>extractNativeDocx(archive(body)),/NUMBERING_MISSING/);
  assert.throws(()=>extractNativeDocx(archive(body,{'word/numbering.xml':strToU8(numberXml('decimal','%2.'))})),/NUMBERING_UNSUPPORTED/);
});

test('numbering honors OOXML overrides and style inheritance, not guessed sequences',()=>{
  const definition=numberXml('decimal','%1.','1').replace('<w:abstractNumId w:val="7"/></w:num>','<w:abstractNumId w:val="7"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="8"/></w:lvlOverride></w:num>');
  const styles='<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:styleId="base"><w:pPr><w:numPr><w:numId w:val="2"/></w:numPr></w:pPr></w:style><w:style w:styleId="child"><w:basedOn w:val="base"/></w:style></w:styles>';
  const body='<w:p><w:pPr><w:pStyle w:val="child"/></w:pPr><w:r><w:t>Nội dung theo nguồn</w:t></w:r></w:p>';
  const result=extractNativeDocx(archive(body,{'word/numbering.xml':strToU8(definition),'word/styles.xml':strToU8(styles)}));
  assert.match(result.markdown,/8\. Nội dung theo nguồn/);
  assert.throws(()=>extractNativeDocx(archive(body,{'word/styles.xml':strToU8(styles.replace('w:val="base"','w:val="child"'))})),/STYLE_UNSUPPORTED/);
});

test('known VML horizontal rule is decoration; actual images/textbox and spoofed namespace are never silently omitted',()=>{
  const rule='<w:p><w:r><w:pict><v:rect style="width:0.0pt;height:1.5pt" o:hr="t" o:hrstd="t"/></w:pict></w:r></w:p>';
  const doc=(r:string)=>zipSync({'word/document.xml':strToU8(wrap(p('Table source')+r).replace('<w:document ','<w:document xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" '))});
  assert.match(extractNativeDocx(doc(rule)).markdown,/Table source/);
  assert.throws(()=>extractNativeDocx(doc(rule.replace('/></w:pict>','><v:imagedata/></v:rect></w:pict>'))),/NON_TEXT/);
  assert.throws(()=>extractNativeDocx(doc(rule.replace('v:rect','v:shape'))),/NON_TEXT/);
  assert.throws(()=>extractNativeDocx(archive(p('source')+'<w:p><w:r><w:drawing/></w:r></w:p>')),/NON_TEXT/);
  const spoof=zipSync({'word/document.xml':strToU8(wrap(p('source')+rule).replace('<w:document ','<w:document xmlns:v="urn:attacker" xmlns:o="urn:schemas-microsoft-com:office:office" '))});
  assert.throws(()=>extractNativeDocx(spoof),/NON_TEXT/);
});

test('header/footer image or substantive text requires review; cached PAGE decoration alone is safe',()=>{
  const footer=(content:string)=>strToU8(`<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${content}</w:ftr>`);
  const pageField='<w:p><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:t>1</w:t></w:r></w:p>';
  assert.doesNotThrow(()=>extractNativeDocx(archive(p('Source'),{'word/footer1.xml':footer(pageField)})));
  assert.throws(()=>extractNativeDocx(archive(p('Source'),{'word/footer1.xml':footer(p('Phí bổ sung: 10.000 đồng'))})),/HEADER_FOOTER/);
  assert.throws(()=>extractNativeDocx(archive(p('Source'),{'word/footer1.xml':footer('<w:p><w:r><w:drawing/></w:r></w:p>')})),/HEADER_FOOTER/);
});

test('invalid grid offsets and conflicting spans cannot cause an unbounded loop or column drift',()=>{
  assert.throws(()=>extractNativeDocx(archive(table('<w:tr><w:trPr><w:gridBefore w:val="99999999"/></w:trPr>'+cell('Value')+'</w:tr>'))),/SPAN_INVALID/);
  assert.throws(()=>extractNativeDocx(archive(table('<w:tr>'+cell('A','<w:gridSpan w:val="2"/><w:vMerge w:val="restart"/>')+'</w:tr><w:tr>'+cell('A','<w:vMerge/>')+cell('B')+'</w:tr>'))),/MERGE_CONFLICT/);
});

test('examination regulations retain all 52 semantic Word units and reject over-budget documents',()=>{
  const body=Array.from({length:52},(_,i)=>p(`Điều ${i+1}. Nội dung gốc ${i+1}`)).join('');
  const result=extractNativeDocx(archive(body));assert.equal(result.pages.length,52);
  assert.match(result.markdown,/Điều 52\./);assert.doesNotMatch(result.markdown,/## Trang/);
  assert.throws(()=>extractNativeDocx(archive(Array.from({length:129},(_,i)=>p(`Điều ${i+1}. Source`)).join(''))),/UNIT_LIMIT/);
});

test('tuition shaped 27-table/446-row fixture retains every row and numerical association',()=>{
  let index=0;
  const body=Array.from({length:27},(_,i)=>table(Array.from({length:i===26?30:16},()=>{
    const id=++index;return '<w:tr>'+cell(`Chương trình ${id}`)+cell(`${id}.000 đồng`)+'</w:tr>';
  }).join(''))).join('');
  const result=extractNativeDocx(archive(body));assert.equal(result.counts.tables,27);assert.equal(result.counts.tableRows,446);
  for(let id=1;id<=446;id++)assert.match(result.markdown,new RegExp(`\\| Chương trình ${id} \\| ${id}\\.000 đồng \\|`));
});
test('native Word cannot guess conflicting merged cells, tracked changes, auto numbering or embedded objects',()=>{
  for(const body of ['<w:ins>'+p('new')+'</w:ins>','<w:p><w:pPr><w:numPr/></w:pPr></w:p>','<w:altChunk/>',table('<w:tr>'+cell('not empty','<w:vMerge/>')+cell('x')+'</w:tr>')])
    assert.throws(()=>extractNativeDocx(archive(body)),/DOCX_/);
});
test('native Word rejects entities, invalid XML, traversal, macros and actual decompression overflow',()=>{
  assert.throws(()=>extractNativeDocx(zipSync({'word/document.xml':strToU8('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///secret">]>'+wrap(p('&secret;')))})),/DTD/);
  assert.throws(()=>extractNativeDocx(archive(p('a'),{'../danger':strToU8('x')})),/UNSAFE_ARCHIVE/);
  assert.throws(()=>extractNativeDocx(archive(p('a'),{'word/vbaProject.bin':strToU8('x')})),/ACTIVE_CONTENT/);
  assert.throws(()=>extractNativeDocx(zipSync({'word/document.xml':strToU8('x'.repeat(4_000_001))})),/XML_LIMIT/);
  assert.throws(()=>extractNativeDocx(zipSync({'word/document.xml':strToU8('<invalid>')})),/INVALID_XML/);
});
test('native Word keeps hyperlinks display-only and extracts notes even with XML declaration',()=>{
  const result=extractNativeDocx(archive('<w:p><w:hyperlink r:id="external"><w:r><w:t>Văn bản gốc</w:t></w:r></w:hyperlink><w:r><w:footnoteReference w:id="1"/></w:r></w:p>',
    {'word/footnotes.xml':strToU8('<?xml version="1.0"?><w:footnotes><w:footnote w:id="1">'+p('Chú thích gốc')+'</w:footnote></w:footnotes>')}));
  assert.match(result.markdown,/Văn bản gốc \[Chú thích: Chú thích gốc\]/);
});
test('native Word verifies source hash and deterministic derived identity; client cannot supply extracted text',async()=>{
  const bytes=archive(p('Text gốc')),hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  const a=await prepareNativeDocx(bytes,hash),b=await prepareNativeDocx(bytes,hash);
  assert.equal(a.derivedContentHash,b.derivedContentHash);assert.deepEqual(a.pages,b.pages);
  await assert.rejects(()=>prepareNativeDocx(bytes,'0'.repeat(64)),/HASH_MISMATCH/);
});
test('Word keeps pre-existing unknown markers rather than repairing them or reporting pristine source quality',()=>{
  const r=extractNativeDocx(archive(p('Số: [KHÔNG ĐỌC RÕ]/QĐ-ĐHNH')));
  assert.match(r.markdown,/\[KHÔNG ĐỌC RÕ\]/);assert.equal(r.uncertainTokens,1);assert.equal(r.ocrUsed,false);
});
test('Word table chunks retain whole rows/header and never copy a previous table as contextual text',()=>{
  const rows='<w:tr>'+cell('A')+cell('B')+'</w:tr>'+Array.from({length:100},(_,i)=>'<w:tr>'+cell(`row ${i}`)+cell('Nội dung '.repeat(12))+'</w:tr>').join('');
  const result=extractNativeDocx(archive(p('Mục học phí')+table(rows)+table('<w:tr>'+cell('C')+cell('D')+'</w:tr>')));
  for(let i=0;i<100;i++)assert.equal(result.markdown.match(new RegExp(`\\| row ${i} \\|`,'g'))?.length,1);
  assert.ok(result.pages.every(u=>u.text.length<=6000));assert.doesNotMatch(result.markdown,/Bảng 1[\s\S]*Bảng 1[\s\S]*Bảng 2[\s\S]*row 99/);
});
test('authorized DOCX key ordinal does not become a physical page; PDF remains unchanged; private chunks excluded',()=>{
  const chunks=[{id:'c',text:'Điều 3',item:{key:`ai-search/text/${DOC}/revision/page-003.md`,metadata:{document_id:DOC,active:true}}}];
  const word=normalizeAuthorizedAiSearchChunks(chunks,[{id:DOC,locatorKind:'word_unit'}]);assert.equal(word[0].pageNumber,undefined);
  assert.equal(normalizeAuthorizedAiSearchChunks(chunks,[{id:DOC,locatorKind:'page'}])[0].pageNumber,3);
  assert.equal(normalizeAuthorizedAiSearchChunks(chunks,[]).length,0);
});
test('Word hydration rechecks D1 and canonical revision key with same three-read bound, no page number needed',async()=>{
  let reads=0;const key=buildDerivedPageObjectKey(DOC,'rev',2);
  const env:any={AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'true',DB:{prepare:()=>({bind:()=>({first:async()=>({ai_search_revision:'rev'})})})},AI_DOCUMENTS_BUCKET:{get:async()=>{reads++;return{body:new ReadableStream(),size:25,text:async()=>'Điều 3. Nội dung Word'};}}};
  const d=buildCompletenessDependencies(env,{search:async()=>({})},{text:'isolated',ocr:'isolated'});
  assert.equal(await d.pageContent!({documentId:DOC,itemKey:key.replace('/rev/','/stale/')}),null);
  for(let i=0;i<3;i++)assert.match((await d.pageContent!({documentId:DOC,itemKey:key}))!,/Word/);
  assert.equal(await d.pageContent!({documentId:DOC,itemKey:key}),null);assert.equal(reads,3);
});
test('two study plans are scoped by explicit program, not recency; no cross-program fallback',()=>{
  const standard={id:DOC,title:'Kế hoạch học tập dành cho sinh viên đại học chính quy chuẩn năm học 2026–2027'};
  const special={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',title:'Kế hoạch tổ chức học tập năm học 2026–2027 chương trình tiếng Anh bán phần, chương trình đặc biệt, chương trình tinh hoa'};
  assert.deepEqual(buildEvidenceRetrievalPlan('Kế hoạch học tập chương trình chuẩn đăng ký học kỳ 2 khi nào?',[standard,special]).scoped,[standard]);
  assert.deepEqual(buildEvidenceRetrievalPlan('Kế hoạch tổ chức học tập chương trình tiếng Anh bán phần đăng ký học kỳ 2 khi nào?',[standard,special]).scoped,[special]);
  assert.deepEqual(buildEvidenceRetrievalPlan('Kế hoạch học tập chương trình tinh hoa khi nào?',[standard]).scoped,[]);
});
test('Word table locator is source-derived and distinguishes extraction ordinal from original table labels',()=>{
  assert.deepEqual(extractOfficialDocumentLocators('Bảng 2 (thứ tự bảng trong DOCX)\n| A | B |'),['Bảng 2 (thứ tự bảng trong DOCX)']);
  assert.deepEqual(extractOfficialDocumentLocators('Bảng 3. Học phí'),['Bảng 3']);
  assert.deepEqual(extractOfficialDocumentLocators('Không có vị trí'),[]);
  assert.deepEqual(extractOfficialDocumentLocators('1.2. Lịch học kỳ 2\nĐăng ký học phần tháng 11/2026'),['1.2. Lịch học kỳ 2']);
  assert.deepEqual(extractOfficialDocumentLocators('Điều 3. Nguyên tắc\n1. Minh bạch\n2. Công bằng\n3. Phối hợp'),['Điều 3']);
});

test('Word scale article and scoring table are cited from the same document; unrelated scale cannot qualify',()=>{
  const scale={sourceId:'S1',documentId:DOC,snippet:'Điều 4. Nội dung\n2. Điểm rèn luyện được đánh giá bằng thang điểm 100.'};
  const table={sourceId:'S2',documentId:DOC,snippet:'Bảng 2 (thứ tự bảng trong DOCX)\n| STT | Nội dung đánh giá | Tiêu chí đánh giá | Khung điểm |\n'+[25,20,20,15,20].map((v,i)=>`| ${i+1} | Nhóm ${i+1} | Tiêu chí | 0 – ${v} điểm |`).join('\n')};
  const r=resolveConductTableAnswer('Bảng điểm rèn luyện có những nhóm nào?',[table,scale])!;
  assert.match(r.reply,/gồm 5 nhóm/);assert.deepEqual(r.sourceIds,['S1','S2']);
  assert.equal(resolveConductTableAnswer('Bảng điểm rèn luyện?',[table,{...scale,documentId:'other'}]),null);
});

test('Word academic milestones select literal semester row/month and complete holiday dates, not truncated cover text',()=>{
  const s={sourceId:'S1',documentId:DOC,revision:'r',locatorKind:'word_unit' as const,snippet:'Bảng 2 (thứ tự bảng trong DOCX)\n| Đợt | Thời gian đăng ký môn học (Dự kiến) |\n| Học kỳ 1 | Từ ngày 02/7/2026 |\n| Học kỳ 2 | Từ ngày 16/11/2026 |'};
  const r=resolveAcademicMilestone('Theo kế hoạch học tập, đăng ký môn học học kỳ 2 khi nào?',[s])!;
  assert.match(r.reply,/16\/11\/2026/);assert.doesNotMatch(r.reply,/02\/7/);assert.match(r.sourceExcerpts.S1,/Bảng 2/);
  const q='Theo kế hoạch tổ chức học tập chương trình tinh hoa, đăng ký học phần học kỳ 2 dự kiến tháng nào?';
  const special={...s,snippet:'(Đăng ký học phần HK2 NH 2026-2027 dự kiến tháng 11/2026)'};
  assert.match(resolveAcademicMilestone(q,[special])!.reply,/11\/2026/);
  assert.equal(resolveAcademicMilestone(q,[special,{...special,sourceId:'S2',snippet:special.snippet.replace('11/2026','12/2026')}]),null);
  assert.equal(resolveAcademicMilestone(q,[{...special,snippet:special.snippet.replace('HK2','HK1')}]),null);
  const tet={...s,snippet:'➢ Nghỉ Tết Nguyên Đán: từ 01/02/2027 đến hết ngày 14/02/2027.'};
  assert.match(resolveAcademicMilestone('Theo kế hoạch tổ chức học tập, nghỉ Tết ngày nào?',[tet])!.reply,/01\/02\/2027.*14\/02\/2027/);
});

test('Word student-affairs article is scoped and excerpted without borrowing an identically numbered decision article',()=>{
  const q='Theo Quy chế công tác sinh viên, Điều 3 quy định những nguyên tắc nào?';
  const s={sourceId:'S1',documentId:DOC,revision:'r',locatorKind:'word_unit' as const,snippet:'Điều 3. Nguyên tắc thực hiện\n1. Công khai, minh bạch, khách quan; ứng dụng chuyển đổi số.\n2. Hướng đến sinh viên.\n3. Phối hợp Trường, gia đình và xã hội.\nChương II\nNội dung khác'};
  const r=resolvePolicyArticleExcerpt(q,[s])!;assert.match(r.reply,/nguyên văn Word/);assert.doesNotMatch(r.reply,/Nội dung khác/);
  assert.equal(resolvePolicyArticleExcerpt(q,[{...s,snippet:s.snippet.replace('Nguyên tắc thực hiện','Tổ chức thi hành')}]),null);
  const doc={id:DOC,title:'Quy chế công tác sinh viên'},other={id:'other',title:'Quy chế đánh giá kết quả rèn luyện sinh viên'};
  assert.deepEqual(buildEvidenceRetrievalPlan(q,[doc,other]).scoped,[doc]);
});

test('Word tuition requires literal units/program/cohort/major inside one unit; rejects ambiguity without guessing unreadable text',()=>{
  const q='Học phí K39 ngành Tài chính ngân hàng chương trình đại học chính quy chuẩn theo năm và theo tín chỉ là bao nhiêu?';
  const s={sourceId:'S1',documentId:DOC,revision:'r',locatorKind:'word_unit' as const,snippet:'Bảng 2 (thứ tự bảng trong DOCX)\n| TT | HỆ/CHƯƠNG TRÌNH | Học phí theo năm<br>(đồng) | Học phí theo tín chỉ<br>(đồng) |\n| A | Đại học chính quy chuẩn | | |\nBảng 3 (thứ tự bảng trong DOCX)\n| Khóa 39 | | | |\n| 1 | Ngành Tài chính ngân hàng | 25.600.000 | 747.000 |'};
  const r=resolveTuitionTableRow(q,[s])!;assert.match(r.reply,/25\.600\.000/);assert.match(r.reply,/747\.000/);assert.match(r.sourceExcerpts.S1,/Bảng 3/);
  assert.doesNotMatch(r.reply,/<br>/);assert.match(r.sourceExcerpts.S1,/<br>/);assert.match(r.reply,/Đại học chính quy chuẩn/);
  assert.equal(resolveTuitionTableRow(q,[{...s,snippet:s.snippet.replace('Khóa 39','Khóa 40')}]),null);
  assert.equal(resolveTuitionTableRow(q,[{...s,snippet:s.snippet.replace('747.000','[KHÔNG ĐỌC RÕ]')}]),null);
  assert.equal(resolveTuitionTableRow(q,[s,{...s,sourceId:'S2',snippet:s.snippet.replace('747.000','748.000')}]),null);
  assert.equal(resolveTuitionTableRow(q,[{...s,snippet:s.snippet.split('Bảng 3')[1]}]),null);
});

test('native Word derived objects round-trip through real local R2 with server filter metadata and immutable original',async()=>{
  const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2025-12-01',r2Buckets:['DOCS']});
  try{
    const bucket=await mf.getR2Bucket('DOCS'),bytes=archive(p('Điều 3. Nguyên tắc')+p('1. Minh bạch và công bằng.'));
    const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
    await bucket.put('ai-documents/source.docx',bytes);
    const prepared=await prepareNativeDocx(bytes,hash);
    const stored=await storeDerivedPdfPages(bucket,{id:DOC,content_hash:hash,version:1,category:'regulation',visibility:'public'},prepared);
    const object=await bucket.get(stored.keys[0]);assert.ok(object);assert.match(await object.text(),/word_unit: 1/);
    assert.deepEqual(Object.keys(object.customMetadata).sort(),['active','category','document_id','revision','visibility']);
    assert.equal(object.customMetadata.document_id,DOC);assert.equal(object.customMetadata.revision,stored.revision);
    assert.deepEqual(new Uint8Array(await(await bucket.get('ai-documents/source.docx'))!.arrayBuffer()),bytes);
  }finally{await mf.dispose();}
});
