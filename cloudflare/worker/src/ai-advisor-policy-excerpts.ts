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
/** Intact source paragraphs only. No semantic repair, guessed facts or legal currency. */
export const resolveConductExcerptAnswer = (question:string,evidence:readonly AuthorizedEvidenceSource[]) => {
  const topic=conductExcerptTopic(question);if(!topic)return null;
  const matches:Array<{sourceId:string;text:string}>=[];
  for(const source of evidence){
    const paragraphs=source.snippet.split(/\n\s*\n|(?=^\s*[-*]\s)/mu);
    for(const original of paragraphs){
      const text=original.trim().replace(/^[-*]\s+/,''),n=normalizeAdvisorIntentText(text);
      if(text.length>650||!/[.!?]$/u.test(text)||/[|]|<!--|\[kh[oô]ng đ[oọ]c r[oõ]\]/iu.test(text))continue;
      const decisive=topic==='online_game'
        ? /\b(?:mini game|minigame|tro choi truc tuyen)\b/.test(n)&&/\b(?:khong duoc tinh|duoc tinh) diem ren luyen\b/.test(n)
        :/\bhoat dong ngoai truong\b/.test(n)&&/\bminh chung\b/.test(n)&&/\bxac nhan\b/.test(n)&&/\bchu ky\b/.test(n)&&/\bdau tron\b/.test(n);
      if(decisive)matches.push({sourceId:source.sourceId,text});
    }
  }
  if(!matches.length||new Set(matches.map(m=>m.text.normalize('NFC').replace(/\s+/gu,' '))).size!==1)return null;
  const match=matches[0];
  const ocr=evidence.find(s=>s.sourceId===match.sourceId)?.snippet.includes('extraction: ocr');
  return {reply:`Theo đoạn nguồn đã truy xuất:\n\n> ${match.text.replace(/\n/g,'\n> ')}\n\n${ocr?'Trích đoạn giữ nguyên văn bản OCR; hãy đối chiếu PDF gốc nếu ký tự chưa rõ. ':''}Đây là nội dung trong tài liệu; chưa đủ bằng chứng xác nhận văn bản mới nhất hoặc còn hiệu lực.`,sourceIds:[match.sourceId]};
};
