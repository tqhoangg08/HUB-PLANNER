/** Presentation only. Titles come from authorized metadata, never model prose
 * or retrieved text. This layer must run AFTER factual/citation validation. */
export const DOCUMENT_STYLE_VERSION='academic-vi-v1';
// GFM also auto-links decoded text AFTER Markdown parsing. A nonprinting word
// joiner prevents URL/email auto-links without changing the visible title.
// Original metadata in the citation/source card is never modified.
export const escapeDocumentMarkdown=(text:string)=>text.replace(/((?:https?|ftp):|www\.)/gi,'$1\u2060').replace(/@/g,'@\u2060').replace(/[!-/:-@\[-`{-~]/g,'\\$&');

export function formatOfficialDocumentReply(reply:string,sources:readonly {documentTitle?:string}[],inline=false){
  const titles=sources.map(s=>typeof s.documentTitle==='string'?s.documentTitle.replace(/[\r\n\t]+/g,' ').trim():'');
  const valid=titles.length>0&&titles.every(t=>t.length>0&&t.length<=1024&&!/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(t));
  const unique=valid?[...new Set(titles)].map(t=>`**${escapeDocumentMarkdown(t)}**`):[];
  const lead=unique.length===1?`Theo ${unique[0]},`:unique.length?`Theo các tài liệu ${unique.join(' và ')},`:'Theo nội dung tài liệu đã công bố,';
  const technical='Đoạn nguồn liên quan đã truy xuất (chưa xác nhận hiệu lực hiện hành; các trích đoạn có thể chưa đủ để trả lời toàn bộ câu hỏi):';
  const body=reply.startsWith(technical)?`Các trích đoạn dưới đây có thể chưa đủ để trả lời toàn bộ câu hỏi.\n\n${reply.slice(technical.length).trim()}\n\nChưa xác nhận hiệu lực hiện hành ngoài nội dung tài liệu đã công bố.`:reply.trim();
  return inline?`${lead} ${body}`:`${lead} nội dung liên quan được trình bày như sau:\n\n${body}`;
}
