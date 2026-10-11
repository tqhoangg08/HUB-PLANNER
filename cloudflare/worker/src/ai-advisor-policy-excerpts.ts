import {normalizeAdvisorIntentText} from './ai-advisor-intents.ts';
import type {AuthorizedEvidenceSource} from './ai-advisor-evidence.ts';

/** Query selection only; no facts, page numbers or expected conclusions. */
export const conductExcerptTopic = (question:string) => {
  const q=normalizeAdvisorIntentText(question);
  if(/\b(?:mini game|minigame|tro choi truc tuyen)\b/.test(q)&&/\b(?:ren luyen|drl)\b/.test(q))return 'online_game';
  if(/\bminh chung\b/.test(q)&&/\bngoai truong\b/.test(q))return 'outside_proof';
  return null;
};
export const conductExcerptSearchQuery = (question:string) => conductExcerptTopic(question)==='online_game'?'mini game'
  :conductExcerptTopic(question)==='outside_proof'?'hoạt động ngoài trường':null;
export const conductExcerptPriority = (question:string,text:string) => {
  const t=normalizeAdvisorIntentText(text),topic=conductExcerptTopic(question);
  if(topic==='online_game')return /\b(?:mini game|minigame|tro choi truc tuyen)\b/.test(t)?1:0;
  if(topic==='outside_proof')return /\bngoai truong\b/.test(t)&&/\bminh chung\b/.test(t)?1:0;
  return 0;
};
/** Carry only literal headings preceding the supported paragraph. An appendix
 * starts a new scope: the preceding article/clause cannot describe its notes.
 * Missing headings produce a broader document citation, never a guessed one. */
const supportedExcerpt = (snippet:string,offset:number,paragraph:string) => {
  let chapter='',article='',clause='',appendix='',table='',note='';
  for(const line of snippet.slice(0,offset).split('\n')){
    const heading=line.trim();
    if(/^Phụ lục(?:\s+(?:[IVXLCDM]+|\d+))?\s*[:.]?$/iu.test(heading)){
      appendix=heading;chapter=article=clause=table=note='';
    }else if(/^Chương\s+(?:[IVXLCDM]+|\d+)\b/iu.test(heading)){
      chapter=heading;article=clause=appendix=table=note='';
    }else if(/^Điều\s+\d+[a-z]?(?:\s*[.:]|\s*$)/iu.test(heading)){
      article=heading;clause=appendix=table=note='';
    }else if(/^Bảng\s+\d+(?:\s*\(thứ tự bảng trong DOCX\))?\s*[:.]?$/iu.test(heading)){
      table=heading;note='';
    }else if(/^Ghi chú\s*[:.]?$/iu.test(heading)){
      note=heading;
    }else if(article&&!note&&/^\d+[.)]\s+\S/u.test(heading)){
      clause=heading;
    }
  }
  return [chapter,article,clause,appendix,table,note,paragraph.trim()].filter(Boolean).join('\n\n');
};
/** Intact source paragraphs only. No semantic repair, guessed facts or legal currency. */
export const resolveConductExcerptAnswer = (question:string,evidence:readonly AuthorizedEvidenceSource[]) => {
  const topic=conductExcerptTopic(question);if(!topic)return null;
  const matches:Array<{sourceId:string;text:string;excerpt:string}>=[];
  for(const source of evidence){
    const paragraphs=source.snippet.split(/\n\s*\n|(?=^\s*[-*]\s)/mu);
    let offset=0;
    for(const original of paragraphs){
      const start=source.snippet.indexOf(original,offset);if(start<0)continue;
      offset=start+original.length;
      const text=original.trim().replace(/^[-*]\s+/,''),n=normalizeAdvisorIntentText(text);
      if(text.length>650||!/[.!?]$/u.test(text)||/[|]|<!--|\[kh[oô]ng đ[oọ]c r[oõ]\]/iu.test(text)
        ||/^(?:Điều\s+\d+|Chương\s+[IVXLCDM\d]+|Phụ lục|Bảng\s+\d+)/imu.test(text))continue;
      const decisive=topic==='online_game'
        ? /\b(?:mini game|minigame|tro choi truc tuyen)\b/.test(n)&&/\b(?:khong duoc tinh|duoc tinh) diem ren luyen\b/.test(n)
        :/\bhoat dong ngoai truong\b/.test(n)&&/\bminh chung\b/.test(n)&&/\bxac nhan\b/.test(n)&&/\bchu ky\b/.test(n)&&/\bdau tron\b/.test(n);
      if(decisive)matches.push({sourceId:source.sourceId,text,excerpt:supportedExcerpt(source.snippet,start,original)});
    }
  }
  if(!matches.length||new Set(matches.map(m=>m.text.normalize('NFC').replace(/\s+/gu,' '))).size!==1)return null;
  const match=matches[0];
  const ocr=evidence.find(s=>s.sourceId===match.sourceId)?.snippet.includes('extraction: ocr');
  return {reply:`Theo đoạn nguồn đã truy xuất:\n\n> ${match.text.replace(/\n/g,'\n> ')}\n\n${ocr?'Trích đoạn giữ nguyên văn bản OCR; hãy đối chiếu PDF gốc nếu ký tự chưa rõ. ':''}Đây là nội dung trong tài liệu; chưa đủ bằng chứng xác nhận văn bản mới nhất hoặc còn hiệu lực.`,sourceIds:[match.sourceId],sourceExcerpts:{[match.sourceId]:match.excerpt}};
};
