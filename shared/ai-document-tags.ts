export const MAX_DOCUMENT_TAGS=12;
export const MAX_DOCUMENT_TAG_LENGTH=60;
export class DocumentTagValidationError extends Error {}
export const normalizeDocumentKeyword=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').replace(/[đĐ]/g,'d').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')
  .replace(/\b(?:hoc le phi|muc thu|tuition)\b/g,'hoc phi').replace(/\b(?:drl|diem ren luyen)\b/g,'ren luyen')
  .replace(/\bphieu (?=ren luyen\b)/g,'bang ');
export function parseDocumentTags(value:unknown):string[]{
  if(!Array.isArray(value)||value.length>MAX_DOCUMENT_TAGS)throw new DocumentTagValidationError('Tối đa 12 tag cho mỗi tài liệu.');
  const result=new Map<string,string>();
  for(const tag of value){
    if(typeof tag!=='string'||tag.length>240)throw new DocumentTagValidationError('Tag không hợp lệ.');
    const label=tag.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi-VN');
    if(!label||label.length>MAX_DOCUMENT_TAG_LENGTH||!/^[\p{L}\p{N} -]+$/u.test(label))throw new DocumentTagValidationError('Tag gồm chữ, số, khoảng trắng hoặc dấu gạch ngang; tối đa 60 ký tự.');
    const key=normalizeDocumentKeyword(label);if(!key)throw new DocumentTagValidationError('Tag không hợp lệ.');
    if(!result.has(key))result.set(key,label);
  }
  return [...result.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,label])=>label);
}
export const documentTagScore=(question:string,tags:readonly string[]=[])=>{
  const q=` ${normalizeDocumentKeyword(question)} `;
  return tags.reduce((score,tag)=>{const key=normalizeDocumentKeyword(tag);return score+(key&&q.includes(` ${key} `)?key.split(' ').length:0);},0);
};
/** Query hints only; never remove an authorized candidate or supply answer facts. */
export const hasMultipleDocumentTopics=(question:string)=>{
  const q=normalizeDocumentKeyword(question);
  return [/\bhoc phi\b/,/\bren luyen\b/,/\bhoc bong\b/,/\b(?:ke hoach|dang ky mon|dang ky hoc phan)\b/,
      /\b(?:khao thi|quy tac ung xu|cong tac sinh vien)\b/].filter(topic=>topic.test(q)).length>1;
};
export const isMultiTopicDocumentQuestion=(question:string)=>hasMultipleDocumentTopics(question)
  ||/\b(?:so sanh|doi chieu|hai tai lieu|nhieu tai lieu)\b/.test(normalizeDocumentKeyword(question));
export const documentTagSearchQuery=(question:string,documents:readonly {tags?:readonly string[]}[])=>{
  if(isMultiTopicDocumentQuestion(question))return question;
  const tags=[...new Set(documents.flatMap(d=>d.tags||[]))].filter(t=>documentTagScore(question,[t])>0).slice(0,3);
  return tags.length?`${question.slice(0,1700)}\nTừ khóa tài liệu: ${tags.join('; ')}`:question;
};
