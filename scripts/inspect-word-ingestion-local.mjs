// Local-only audit. Never uploads files or prints source text; accepts an explicit directory.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync,strFromU8} from 'fflate';
import {extractNativeDocx} from '../cloudflare/worker/src/ai-document-docx.ts';
import {assessDocumentPageText} from '../shared/ai-document-text-quality.ts';
import {XMLParser} from 'fast-xml-parser';
const names=[
 'Kế hoạch tổ chức học tập năm học 2026–2027 hệ đại học chính quy chương trình tiếng Anh bán phần, chương trình đặc biệt, chương trình tinh hoa.docx',
 'Quy chế công tác khảo thí bậc đại học.docx',
 'Kế hoạch học tập dành cho sinh viên đại học chính quy chuẩn năm học 2026–2027.docx',
 'Quyết định về mức thu học phí và các loại giá dịch vụ năm học 2026–2027 cho các hệ đào tạo.docx',
 'Cẩm nang sinh viên năm học 2025 - 2026.pdf',
];
if(!process.argv[2])throw new Error('Explicit local source directory required');
for(const name of names){
 const bytes=fs.readFileSync(path.join(process.argv[2],name));
 const report={file:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 if(name.endsWith('.docx')){
  const zip=unzipSync(bytes),xml=strFromU8(zip['word/document.xml']);
  report.structures=Object.fromEntries(['numPr','drawing','pict','txbxContent','ins','del','vMerge','gridSpan','hMerge'].map(t=>[t,(xml.match(new RegExp(`<w:${t}\\b`,'g'))||[]).length]));
  report.archive={numbering:!!zip['word/numbering.xml'],styles:!!zip['word/styles.xml'],media:Object.keys(zip).filter(k=>k.startsWith('word/media/')).length};
  try{
   const result=extractNativeDocx(bytes);report.extraction=result.counts;
   const nodes=new XMLParser({ignoreAttributes:false,parseTagValue:false,trimValues:false}).parse(xml);
   const textNodes=[];
   const collect=(node)=>{if(!node||typeof node!=='object')return;for(const [key,value]of Object.entries(node)){
    if(key==='w:t')for(const t of Array.isArray(value)?value:[value])textNodes.push(typeof t==='object'?t['#text']:t);
    else if(typeof value==='object')collect(value);
   }};collect(nodes);
   const flat=result.markdown.replace(/\\\|/g,'|').replace(/<br>/g,' ').replace(/\s+/g,' ');
   report.nonemptySourceTextMissing=textNodes.filter(t=>String(t||'').trim()&&!flat.includes(String(t).normalize('NFC').replace(/\s+/g,' ').trim())).length;
   report.status=report.nonemptySourceTextMissing?'CONTENT_CHECK_REQUIRED':'PASS';
  }catch(e){report.status=e.message;}
 }else{
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
  try{
   let ocrRequired=0,textBytes=0;
   for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n),c=await page.getTextContent();
    const text=c.items.map(i=>i.str||'').join(' ');
    textBytes+=Buffer.byteLength(text);
    if(assessDocumentPageText(text).classification==='OCR_REQUIRED')ocrRequired++;
    page.cleanup();
   }
   report.pdf={pages:pdf.numPages,textBytes,ocrRequiredByTextQuality:ocrRequired};
  }finally{await pdf.destroy();}
 }
 console.log(JSON.stringify(report));
}
