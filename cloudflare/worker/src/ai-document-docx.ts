/** Native OOXML extraction. Never invokes OCR, a model, external links or macros. */
import {Unzip,UnzipInflate} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {assemblePageAwareMarkdown,type DerivedPage} from './ai-document-ingestion.ts';

export const DOCX_NATIVE_PIPELINE='docx-native-structured-v1';
export const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
type XmlNode=Record<string,unknown>;
const enc=new TextEncoder(),MAX_XML=4_000_000,MAX_TEXT=1_000_000,MAX_UNIT=6000;
const tag=(n:XmlNode)=>Object.keys(n).find(k=>k!==':@')||'';
const children=(n:XmlNode):XmlNode[]=>Array.isArray(n[tag(n)])?n[tag(n)] as XmlNode[]:[];
const find=(nodes:XmlNode[],name:string)=>nodes.find(n=>tag(n)===name);
const attrs=(n:XmlNode|undefined)=>(n?.[':@']||{}) as Record<string,string>;
const value=(nodes:XmlNode[],name:string)=>attrs(find(nodes,name))['@_w:val'];
export class DocxExtractionError extends Error {}
const fail=(reason:string):never=>{throw new DocxExtractionError(reason);};

/** Streaming inflate caps actual output, not only untrusted ZIP declared sizes. */
export function readDocxXml(bytes:Uint8Array):Map<string,string>{
  if(!bytes.length||bytes.length>20*1024*1024)fail('DOCX_FILE_LIMIT');
  const out=new Map<string,string>();let entries=0,total=0;
  let rejection:DocxExtractionError|undefined;
  const zip=new Unzip(file=>{
    if(++entries>512||file.name.includes('..')||file.name.startsWith('/')||file.name.includes('\\'))fail('DOCX_UNSAFE_ARCHIVE');
    if(/vbaProject|\.bin$/i.test(file.name))fail('DOCX_ACTIVE_CONTENT_UNSUPPORTED');
    if(!['word/document.xml','word/footnotes.xml','word/endnotes.xml'].includes(file.name))return;
    if(out.has(file.name)||(file.originalSize!==undefined&&file.originalSize>MAX_XML))fail('DOCX_XML_LIMIT');
    out.set(file.name,'');const parts:Uint8Array[]=[];let size=0;
    file.ondata=(error,data,final)=>{
      if(rejection)return;
      try{
      if(error)fail('DOCX_INVALID_ARCHIVE');
      size+=data.length;total+=data.length;
      if(size>MAX_XML||total>MAX_XML){file.terminate();fail('DOCX_XML_LIMIT');}
      parts.push(data);
      if(final){const combined=new Uint8Array(size);let offset=0;for(const p of parts){combined.set(p,offset);offset+=p.length;}
        const xml=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(combined);
        if(/<!DOCTYPE|<!ENTITY/i.test(xml))fail('DOCX_DTD_FORBIDDEN');
        if(XMLValidator.validate(xml)!==true)fail('DOCX_INVALID_XML');
        out.set(file.name,xml);
      }
      }catch(error){rejection=error instanceof DocxExtractionError?error:new DocxExtractionError('DOCX_INVALID_ARCHIVE');file.terminate();}
    };file.start();
  });zip.register(UnzipInflate);
  try{for(let n=0;n<bytes.length;n+=8192){zip.push(bytes.subarray(n,n+8192),n+8192>=bytes.length);if(rejection)throw rejection;}}catch(error){
    if(error instanceof DocxExtractionError)throw error;fail('DOCX_INVALID_ARCHIVE');
  }
  if(!out.get('word/document.xml'))fail('DOCX_BODY_MISSING');return out;
}
const parse=(xml:string):XmlNode[]=>new XMLParser({preserveOrder:true,ignoreAttributes:false,parseTagValue:false,
  parseAttributeValue:false,trimValues:false,processEntities:true}).parse(xml) as XmlNode[];

export function extractNativeDocx(bytes:Uint8Array){
  const files=readDocxXml(bytes),xml=files.get('word/document.xml')!;
  // Explicitly block unsupported revisions/numbering instead of silently
  // accepting/deleting text or guessing a list label. The five current sources
  // use literal numbered text; these checks also protect future uploads.
  if(/<w:(?:ins|del|moveFrom|moveTo|altChunk|object|txbxContent|numPr)\b/.test(xml))fail('DOCX_REVIEW_OR_UNSUPPORTED_STRUCTURE_REQUIRED');
  const root=find(parse(xml),'w:document');
  if(!root||attrs(root)['@_xmlns:w']!=='http://schemas.openxmlformats.org/wordprocessingml/2006/main')fail('DOCX_NAMESPACE_UNSUPPORTED');
  const body=find(children(root),'w:body');if(!body)fail('DOCX_BODY_MISSING');
  const notes=new Map<string,string>();let nodesSeen=0;
  const inline=(nodes:XmlNode[],depth=0):string=>{
    if(depth>40||nodesSeen++>100_000)fail('DOCX_STRUCTURE_LIMIT');
    return nodes.map(n=>{
      const t=tag(n),c=children(n);
      if(t==='#text')return String(n[t]);
      if(t==='w:t')return inline(c,depth+1);
      if(t==='w:tab')return '\t';
      if(t==='w:br'||t==='w:cr')return '\n';
      if(t==='w:noBreakHyphen')return '\u2011';
      if(t==='w:softHyphen')return '\u00ad';
      if(t==='w:footnoteReference'||t==='w:endnoteReference'){
        const note=notes.get(`${t}:${attrs(n)['@_w:id']}`);if(!note)fail('DOCX_NOTE_MISSING');return ` [Chú thích: ${note}]`;
      }
      if(['w:pPr','w:rPr','w:tcPr','w:tblPr','w:tblGrid','w:trPr','w:instrText'].includes(t))return '';
      if(t==='w:sym'||t==='w:drawing'||t==='w:pict')fail('DOCX_NON_TEXT_CONTENT_REQUIRES_REVIEW');
      return inline(c,depth+1);
    }).join('');
  };
  for(const [name,kind]of [['word/footnotes.xml','w:footnoteReference'],['word/endnotes.xml','w:endnoteReference']]){
    if(!files.has(name))continue;
    const noteRoot=find(parse(files.get(name)!),name.includes('footnotes')?'w:footnotes':'w:endnotes');
    if(!noteRoot)fail('DOCX_NOTE_MISSING');
    for(const note of children(noteRoot)){const id=attrs(note)['@_w:id'];if(Number(id)<1)continue;
      notes.set(`${kind}:${id}`,children(note).filter(n=>tag(n)==='w:p').map(n=>inline(children(n))).join('\n').trim());}
  }
  const blocks:string[]=[];let tableCount=0,paragraphCount=0,tableRows=0;
  let contextParagraphs:string[]=[];
  const paragraph=(n:XmlNode)=>{paragraphCount++;return inline(children(n)).normalize('NFC').trim();};
  for(const n of children(body)){
    if(tag(n)==='w:p'){const text=paragraph(n);if(text){blocks.push(text);contextParagraphs.push(text);contextParagraphs=contextParagraphs.slice(-2);}continue;}
    if(tag(n)==='w:sectPr')continue;
    if(tag(n)!=='w:tbl')fail('DOCX_BODY_STRUCTURE_UNSUPPORTED');
    tableCount++;const table=children(n),grid=find(table,'w:tblGrid');
    const width=grid?children(grid).filter(n=>tag(n)==='w:gridCol').length:0;
    if(width<1||width>30)fail('DOCX_TABLE_GRID_UNSUPPORTED');
    let carry=new Map<number,{text:string;span:number}>();const rows:string[][]=[];
    for(const row of table.filter(n=>tag(n)==='w:tr')){
      const cells=children(row).filter(n=>tag(n)==='w:tc');let col=0;const rowText:string[]=[],next=new Map<number,{text:string;span:number}>();
      const before=Number(value(children(find(children(row),'w:trPr')||{}),'w:gridBefore')||0);
      for(let i=0;i<before;i++){rowText.push('');col++;}
      for(const cell of cells){
        const contents=children(cell),properties=children(find(contents,'w:tcPr')||{});
        const span=Number(value(properties,'w:gridSpan')||1),merge=find(properties,'w:vMerge');
        if(!Number.isInteger(span)||span<1||col+span>width)fail('DOCX_TABLE_SPAN_INVALID');
        if(contents.some(c=>!['w:p','w:tcPr'].includes(tag(c))))fail('DOCX_NESTED_TABLE_UNSUPPORTED');
        let text=contents.filter(c=>tag(c)==='w:p').map(paragraph).filter(Boolean).join('\n');
        if(merge&&attrs(merge)['@_w:val']!=='restart'){
          const prior=carry.get(col);if(!prior||prior.span!==span||text)fail('DOCX_TABLE_MERGE_CONFLICT');text=prior.text;
        }
        if(merge)next.set(col,{text,span});
        rowText.push(text);for(let i=1;i<span;i++)rowText.push('');col+=span;
      }
      while(rowText.length<width)rowText.push('');carry=next;rows.push(rowText);tableRows++;
    }
    if(!rows.length)continue;
    const cell=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\|/g,'\\|').replace(/\n/g,'<br>');
    const row=(r:string[])=>`| ${r.map(cell).join(' | ')} |`;
    // Repeat only original context and original header, never inferred values.
    const context=contextParagraphs.filter(p=>p.length<=450).join('\n\n');
    const prefix=`${context}\n\nBảng ${tableCount} (thứ tự bảng trong DOCX)\n${row(rows[0])}\n${row(Array.from({length:width},()=> '---'))}`;
    let part=prefix;
    for(const r of rows.slice(1)){
      const line=row(r);if(prefix.length+line.length>MAX_UNIT)fail('DOCX_TABLE_ROW_LIMIT');
      if(part.length+line.length+1>MAX_UNIT){blocks.push(part);part=prefix;}part+='\n'+line;
    }blocks.push(part);
  }
  const units:string[]=[];let current='';
  for(const b of blocks){
    if(b.length>MAX_UNIT)fail('DOCX_PARAGRAPH_LIMIT');
    // Article boundaries help exact citations; do not join unrelated articles.
    if(current&&(current.length+b.length+2>MAX_UNIT||/^Điều\s+\d+\b/i.test(b))){units.push(current);current='';}
    current+=(current?'\n\n':'')+b;
  }if(current)units.push(current);
  if(!units.length||units.length>40||enc.encode(units.join('\n')).length>MAX_TEXT)fail('DOCX_TEXT_LIMIT');
  const pages:DerivedPage[]=units.map((text,i)=>({pageNumber:i+1,text,sourceKind:'native_text',layout:'lines',sourceFormat:'docx'}));
  const markdown=assemblePageAwareMarkdown(pages).trim();
  return {pages,markdown,ocrUsed:false,pipelineVersion:DOCX_NATIVE_PIPELINE,
    uncertainTokens:(markdown.match(/\[KHÔNG ĐỌC RÕ\]|\[không đọc rõ\]|\uFFFD/g)||[]).length,
    counts:{paragraphs:paragraphCount,tables:tableCount,tableRows,units:pages.length,textBytes:enc.encode(markdown).length}};
}

export async function prepareNativeDocx(bytes:Uint8Array,sourceContentHash:string){
  const result=extractNativeDocx(bytes);
  const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==sourceContentHash)fail('DOCX_SOURCE_HASH_MISMATCH');
  const derivedContentHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(result.markdown))),b=>b.toString(16).padStart(2,'0')).join('');
  return {...result,derivedContentHash};
}
