/** Native OOXML extraction. Never invokes OCR, a model, external links or macros. */
import {Unzip,UnzipInflate} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {assemblePageAwareMarkdown,type DerivedPage} from './ai-document-ingestion.ts';
import {AI_DOCUMENT_MAX_SEGMENTS,AI_DOCUMENT_MAX_TEXT_BYTES} from '../../../shared/ai-document-limits.ts';

export const DOCX_NATIVE_PIPELINE='docx-native-structured-v2';
export const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
type XmlNode=Record<string,unknown>;
const enc=new TextEncoder(),MAX_XML=4_000_000,MAX_TEXT=AI_DOCUMENT_MAX_TEXT_BYTES,MAX_UNIT=6000;
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
    if(!['word/document.xml','word/footnotes.xml','word/endnotes.xml','word/numbering.xml','word/styles.xml'].includes(file.name)
      &&!/^word\/(?:header|footer)\d+\.xml$/.test(file.name))return;
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

/** A narrowly verified non-text decoration. Anything with image data, text,
 * nested children or a different shape stays a review error. */
const isTextFreeHorizontalRule=(n:XmlNode,namespace:Record<string,string>)=>{
  const c=children(n);if(c.length!==1||tag(c[0])!=='v:rect'||children(c[0]).length)return false;
  const a=attrs(c[0]);
  return namespace['@_xmlns:v']==='urn:schemas-microsoft-com:vml'
    &&namespace['@_xmlns:o']==='urn:schemas-microsoft-com:office:office'
    &&a['@_o:hr']==='t'&&a['@_o:hrstd']==='t'
    &&/^width:0(?:\.0)?(?:pt)?;height:1\.5pt$/.test(a['@_style']||'')
    &&Object.keys(a).every(k=>['@_id','@_style','@_o:hr','@_o:hrstd','@_o:hralign','@_fillcolor','@_stroked'].includes(k));
};

/** Supported list labels come solely from numbering.xml. Complex linked,
 * picture, legal or multilevel numeric lists fail closed rather than guess. */
const createNumbering=(files:Map<string,string>)=>{
  const numbering=files.has('word/numbering.xml')?find(parse(files.get('word/numbering.xml')!),'w:numbering'):undefined;
  if(numbering&&attrs(numbering)['@_xmlns:w']!=='http://schemas.openxmlformats.org/wordprocessingml/2006/main')fail('DOCX_NUMBERING_UNSUPPORTED');
  const defs=children(numbering||{}),nums=defs.filter(n=>tag(n)==='w:num');
  const abstracts=defs.filter(n=>tag(n)==='w:abstractNum');
  const styleRoot=files.has('word/styles.xml')?find(parse(files.get('word/styles.xml')!),'w:styles'):undefined;
  const styles=children(styleRoot||{}).filter(n=>tag(n)==='w:style');
  if(styleRoot&&attrs(styleRoot)['@_xmlns:w']!=='http://schemas.openxmlformats.org/wordprocessingml/2006/main')fail('DOCX_NUMBERING_STYLE_UNSUPPORTED');
  const counters=new Map<string,number>();
  const styleProperties=(id:string,seen=new Set<string>()):XmlNode[]=>{
    if(seen.has(id)||seen.size>20)fail('DOCX_NUMBERING_STYLE_UNSUPPORTED');seen.add(id);
    const s=styles.find(n=>attrs(n)['@_w:styleId']===id);if(!s)return [];
    const c=children(s),own=children(find(c,'w:pPr')||{});
    if(find(own,'w:numPr'))return own;
    const parent=value(c,'w:basedOn');return parent?styleProperties(parent,seen):own;
  };
  return (p:XmlNode):string=>{
    const properties=children(find(children(p),'w:pPr')||{});
    const style=value(properties,'w:pStyle')||attrs(styles.find(n=>attrs(n)['@_w:type']==='paragraph'&&['1','true'].includes(attrs(n)['@_w:default'])))['@_w:styleId'];
    const numPr=find(properties,'w:numPr')||find(style?styleProperties(style):[],'w:numPr');
    if(!numPr)return '';
    const props=children(numPr),numId=value(props,'w:numId');
    if(numId==='0')return '';
    const level=Number(value(props,'w:ilvl')??0);
    if(!numId||!Number.isInteger(level)||level<0||level>8)fail('DOCX_NUMBERING_UNSUPPORTED');
    const num=nums.find(n=>attrs(n)['@_w:numId']===numId);
    if(!num)fail('DOCX_NUMBERING_MISSING');
    const abstractId=value(children(num),'w:abstractNumId');
    const abstract=abstracts.find(n=>attrs(n)['@_w:abstractNumId']===abstractId);
    if(!abstract||children(abstract).some(n=>['w:numStyleLink','w:styleLink'].includes(tag(n))))fail('DOCX_NUMBERING_UNSUPPORTED');
    const override=children(num).find(n=>tag(n)==='w:lvlOverride'&&attrs(n)['@_w:ilvl']===String(level));
    const lvl=find(children(override||{}),'w:lvl')||children(abstract).find(n=>tag(n)==='w:lvl'&&attrs(n)['@_w:ilvl']===String(level));
    if(!lvl)fail('DOCX_NUMBERING_MISSING');
    const c=children(lvl),format=value(c,'w:numFmt'),label=value(c,'w:lvlText');
    if(!label||label.length>80||children(lvl).some(n=>['w:lvlPicBulletId','w:isLgl'].includes(tag(n))))fail('DOCX_NUMBERING_UNSUPPORTED');
    const suffix=value(c,'w:suff')||'tab';
    if(!['tab','space','nothing'].includes(suffix))fail('DOCX_NUMBERING_UNSUPPORTED');
    const gap=suffix==='nothing'?'':suffix==='space'?' ':'\t';
    if(format==='bullet'){
      if(/%[1-9]|[\uE000-\uF8FF]/.test(label))fail('DOCX_NUMBERING_UNSUPPORTED');
      return label+gap;
    }
    if(format!=='decimal'||level!==0||!label.includes('%1')||/%[2-9]/.test(label)||find(c,'w:lvlRestart'))fail('DOCX_NUMBERING_UNSUPPORTED');
    const start=Number(value(children(override||{}),'w:startOverride')??value(c,'w:start'));
    if(!Number.isInteger(start)||start<0||start>1_000_000)fail('DOCX_NUMBERING_UNSUPPORTED');
    const count=(counters.get(numId)??start-1)+1;counters.set(numId,count);
    return label.replace(/%1/g,String(count))+gap;
  };
};

export function extractNativeDocx(bytes:Uint8Array){
  const files=readDocxXml(bytes),xml=files.get('word/document.xml')!;
  // These structures require human review; numbering is resolved from OOXML.
  if([...files.values()].some(part=>/<w:(?:ins|del|moveFrom|moveTo|altChunk|object|txbxContent|pPrChange|rPrChange|tblPrChange|tcPrChange|trPrChange)\b/.test(part)))fail('DOCX_REVIEW_OR_UNSUPPORTED_STRUCTURE_REQUIRED');
  const root=find(parse(xml),'w:document');
  if(!root||attrs(root)['@_xmlns:w']!=='http://schemas.openxmlformats.org/wordprocessingml/2006/main')fail('DOCX_NAMESPACE_UNSUPPORTED');
  const body=find(children(root),'w:body');if(!body)fail('DOCX_BODY_MISSING');
  // Ancillary text is not silently dropped. A PAGE field's cached number is
  // decoration, not a verified physical DOCX page. Other header/footer content
  // needs a richer extractor/review before ingestion is permitted.
  for(const [name,part]of files){
    if(!/^word\/(?:header|footer)\d+\.xml$/.test(name))continue;
    const nodes=parse(part);const texts:string[]=[],instructions:string[]=[];let unsupported=false,count=0;
    const scan=(nodes:XmlNode[],depth=0)=>{if(depth>40||count++>100_000)fail('DOCX_STRUCTURE_LIMIT');for(const node of nodes){const t=tag(node);
      if(['w:drawing','w:pict','w:tbl','w:numPr','w:txbxContent'].includes(t))unsupported=true;
      if(t==='w:t')texts.push(children(node).map(c=>String(c['#text']||'')).join(''));
      if(t==='w:instrText')instructions.push(children(node).map(c=>String(c['#text']||'')).join(''));
      scan(children(node),depth+1);}};scan(nodes);
    if(unsupported||texts.some(t=>t.trim()&&!/^\d+$/.test(t.trim()))
      ||texts.some(t=>t.trim())&&(!instructions.length||instructions.some(t=>!/^\s*PAGE\s*$/.test(t))))fail('DOCX_HEADER_FOOTER_REQUIRES_REVIEW');
  }
  const numbering=createNumbering(files);
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
      if(t==='w:pict'&&isTextFreeHorizontalRule(n,attrs(root)))return '\n';
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
  const paragraph=(n:XmlNode)=>{paragraphCount++;const text=inline(children(n)).normalize('NFC').trim();return numbering(n)+text;};
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
      const after=Number(value(children(find(children(row),'w:trPr')||{}),'w:gridAfter')||0);
      if(!Number.isInteger(before)||before<0||before>width||!Number.isInteger(after)||after<0||after>width)fail('DOCX_TABLE_SPAN_INVALID');
      for(let i=0;i<before;i++){rowText.push('');col++;}
      for(const cell of cells){
        const contents=children(cell),properties=children(find(contents,'w:tcPr')||{});
        const span=Number(value(properties,'w:gridSpan')||1),merge=find(properties,'w:vMerge');
        if(find(properties,'w:hMerge')||merge&&![undefined,'restart','continue'].includes(attrs(merge)['@_w:val']))fail('DOCX_TABLE_MERGE_UNSUPPORTED');
        if(!Number.isInteger(span)||span<1||col+span>width)fail('DOCX_TABLE_SPAN_INVALID');
        if(contents.some(c=>!['w:p','w:tcPr'].includes(tag(c))))fail('DOCX_NESTED_TABLE_UNSUPPORTED');
        let text=contents.filter(c=>tag(c)==='w:p').map(paragraph).filter(Boolean).join('\n');
        if(merge&&attrs(merge)['@_w:val']!=='restart'){
          const prior=carry.get(col);
          // Only exact NFC paragraph text repeated by the source producer is
          // redundant. Never fuzzy-match differing dates, numbers or accents.
          if(!prior||prior.span!==span||(text&&text!==prior.text))fail('DOCX_TABLE_MERGE_CONFLICT');text=prior.text;
        }
        if(merge)next.set(col,{text,span});
        rowText.push(text);for(let i=1;i<span;i++)rowText.push('');col+=span;
      }
      if(col+after>width)fail('DOCX_TABLE_SPAN_INVALID');
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
  if(!units.length||units.length>AI_DOCUMENT_MAX_SEGMENTS)fail('DOCX_UNIT_LIMIT');
  if(enc.encode(units.join('\n')).length>MAX_TEXT)fail('DOCX_TEXT_LIMIT');
  const pages:DerivedPage[]=units.map((text,i)=>({pageNumber:i+1,text,sourceKind:'native_text',layout:'lines',sourceFormat:'docx'}));
  const markdown=assemblePageAwareMarkdown(pages).trim();
  if(enc.encode(markdown).length>MAX_TEXT)fail('DOCX_TEXT_LIMIT');
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
