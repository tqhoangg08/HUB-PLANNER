import {AI_DOCUMENT_MAX_SEGMENTS,AI_DOCUMENT_MAX_TEXT_BYTES} from './ai-document-limits.ts';
export const TEXT_FIRST_PIPELINE='admin-text-structured-v1';
export const TEXT_SEGMENT_MAX_CHARS=6000;
export type TextSegment={number:number;text:string};
export class TextDocumentValidationError extends Error {}
const heading=(line:string)=>/^(?:#{1,6}\s+\S|(?:Chương|Điều|Khoản|Mục|Phụ lục|Bảng)\s+\S)/iu.test(line.trim());
const tableLine=(line:string)=>/^\s*\|/.test(line)||line.includes('\t');

/** Raw source is stored unchanged. Only lossless line-boundary slices are indexed.
 * Tables/fenced blocks/paragraphs are atomic: oversized blocks require Admin review,
 * never silent truncation, a guessed column, or a split fee table. */
export function segmentDocumentText(text:string):TextSegment[] {
  if(!text.trim()||new TextEncoder().encode(text).length>AI_DOCUMENT_MAX_TEXT_BYTES||/\u0000/.test(text))
    throw new TextDocumentValidationError('Nội dung phải có văn bản, không chứa NUL và không vượt 1 MB.');
  const lines=text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean)||[];
  const blocks:Array<{text:string;startsSection:boolean}>=[];
  let current='',kind='',fence='';
  const flush=()=>{if(current){blocks.push({text:current,startsSection:heading(current.split(/\r\n|\r|\n/)[0])});current='';}kind='';};
  for(const line of lines){
    const trimmed=line.trim(),marker=trimmed.match(/^(`{3,}|~{3,})/)?.[1];
    if(fence){current+=line;if(marker&&marker[0]===fence[0]&&marker.length>=fence.length){fence='';flush();}continue;}
    if(marker){flush();fence=marker;kind='fence';current=line;continue;}
    const next=tableLine(line)?'table':!trimmed?'blank':heading(line)?'heading':'paragraph';
    if(next==='heading'){flush();current=line;flush();continue;}
    if(next!==kind)flush();current+=line;kind=next;
  }
  if(fence)throw new TextDocumentValidationError('Khối Markdown chưa đóng; hãy kiểm tra trước khi lưu.');
  flush();
  const segments:TextSegment[]=[];let buffer='';
  const emit=()=>{if(buffer.trim()){segments.push({number:segments.length+1,text:buffer});buffer='';}};
  for(const block of blocks){
    if(block.text.length>TEXT_SEGMENT_MAX_CHARS)throw new TextDocumentValidationError('Một bảng/đoạn vượt 6.000 ký tự. Hãy chia thành các mục hoặc bảng độc lập, giữ đầy đủ tiêu đề và số liệu.');
    if(buffer.trim()&&(block.startsSection||buffer.length+block.text.length>TEXT_SEGMENT_MAX_CHARS))emit();
    buffer+=block.text;
  }
  emit();
  if(segments.length>AI_DOCUMENT_MAX_SEGMENTS)throw new TextDocumentValidationError('Tài liệu vượt 128 phân đoạn; hãy chia thành các tài liệu có phạm vi rõ ràng.');
  return segments;
}
export const renderTextSegment=(segment:TextSegment)=>`<!-- text_unit: ${segment.number} -->\n\n${segment.text}`;
/** Physical pages are unknown for native DOCX and pasted text alike. */
export const isUnpaginatedNativePipeline=(pipeline:unknown)=>pipeline==='docx-native-structured-v1'||pipeline===TEXT_FIRST_PIPELINE;
