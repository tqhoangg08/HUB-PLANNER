/** Exact source selection only. No repair of OCR, numbers, words or merged cells. */
export const isConductTableQuestion = (question: string) => {
  const folded = question.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();
  return /(?:ren luyen|\bdrl\b)/u.test(folded) && /(?:bang|phieu|nhom|tieu chi|thang diem)/u.test(folded);
};

/** Prefer physical table fragments, not presumed page numbers or expected point values. */
export const conductTableEvidencePriority = (text: string) => {
  const rows = text.split('\n').filter((line) => /^\|\s*\d+\s*\|/u.test(line));
  // AI Search may split the page after its header. A literal four-cell score
  // range is a retrieval hint only; the complete original header is still
  // mandatory before the deterministic answer can be accepted.
  const scoreRow=rows.some(line=>{const cells=line.split('|').slice(1,-1).map(c=>c.trim());return cells.length===4&&/^0\s*[—–-]\s*\d+\b/u.test(cells[3]);});
  return rows.length && (/Khung điểm/u.test(text)||scoreRow) ? 1 : 0;
};

/** Lossless presentation of independently read cells, not semantic OCR repair.
 * The original physical rows remain attached for review and continuation cells.
 * Header roles must be present in the actual scan-derived table; arbitrary
 * four-column tables are never interpreted as a conduct scoring table.
 */
export const presentConductTableEvidence = (text: string) => {
  if(!/\|\s*STT\s*\|\s*Nội dung đánh giá\s*\|\s*Tiêu chí đánh giá\s*\|\s*Khung điểm\s*\|/u.test(text))return text;
  const rows=text.split('\n').flatMap(line=>{
    const cells=line.split('|').slice(1,-1).map(c=>c.trim());
    if(cells.length!==4||!/^\d+$/u.test(cells[0])||!cells[1]||!/^0\s*[—–-]\s*\d+\b/u.test(cells[3])||cells.some(c=>c.includes('[không đọc rõ]')))return [];
    const content=cells[1].replace(/<br\s*\/?\s*>/giu,' ').replace(/\s+/gu,' ').trim();
    return [`STT ${cells[0]}. Nội dung đánh giá: ${content}\nKhung điểm: ${cells[3]}`];
  });
  return rows.length?`Bảng trích theo ô gốc (không sửa chữ OCR):\n${rows.join('\n\n')}\n\n--- Bảng vật lý và văn bản gốc ---\n${text}`:text;
};

/** Complete, source-derived table answer. No LLM prose is accepted or repaired.
 * Only an explicit 100-point statement + unique consecutive numbered rows
 * whose actual maxima sum to 100 qualify. Incomplete/uncertain tables abstain.
 */
export const resolveConductTableAnswer = (question:string,evidence:readonly {sourceId:string;documentId:string;pageNumber?:number;snippet:string}[]) => {
  if(!isConductTableQuestion(question))return null;
  const physical=evidence.filter(s=>conductTableEvidencePriority(s.snippet)).sort((a,b)=>(a.pageNumber??0)-(b.pageNumber??0));
  if(!physical.length||new Set(physical.map(s=>s.documentId)).size!==1)return null;
  // The scale statement may be in the preceding article/Word unit. It must
  // be retrieved from the SAME authorized document, and cited separately.
  const scale=evidence.find(s=>s.documentId===physical[0].documentId&&/thang điểm 100\b/u.test(s.snippet));
  if(!scale)return null;
  const rows=new Map<number,{label:string;max:number;sourceIds:string[]}>();
  let previous:{number:number;page:number|undefined}|undefined;
  for(const source of physical){
    const original=source.snippet.split('--- Bảng vật lý và văn bản gốc ---\n').pop()!;
    if(!/\|\s*STT\s*\|\s*Nội dung đánh giá\s*\|\s*Tiêu chí đánh giá\s*\|\s*Khung điểm\s*\|/u.test(original))return null;
    for(const line of original.split('\n')){
      const cells=line.split('|').slice(1,-1).map(c=>c.trim());
      if(cells.length!==4)continue;
      if(cells.some(c=>c.includes('[không đọc rõ]')))return null;
      const label=cells[1].replace(/<br\s*\/?\s*>/giu,' ').replace(/\s+/gu,' ').trim();
      if(!cells[0]&&label&&previous&&source.pageNumber===Number(previous.page)+1&&!cells[3]){
        const row=rows.get(previous.number)!;row.label+=' '+label;row.sourceIds.push(source.sourceId);previous=undefined;continue;
      }
      if(!/^\d+$/u.test(cells[0]))continue;
      const range=cells[3].match(/^0\s*[—–-]\s*(\d+)\b/u);
      if(!range||!label)return null;
      const number=Number(cells[0]);if(rows.has(number))return null;
      rows.set(number,{label,max:Number(range[1]),sourceIds:[source.sourceId]});previous={number,page:source.pageNumber};
    }
  }
  const numbered=[...rows.entries()].sort((a,b)=>a[0]-b[0]);
  if(numbered.length<2||numbered.length>10||numbered.some(([n],i)=>n!==i+1)||numbered.reduce((sum,[,r])=>sum+r.max,0)!==100)return null;
  const sourceExcerpts:Record<string,string>=Object.fromEntries(physical.map(s=>[s.sourceId,s.snippet.split('--- Bảng vật lý và văn bản gốc ---\n').pop()!]));
  if(!physical.some(s=>s.sourceId===scale.sourceId)){
    const lines=scale.snippet.split('\n'),index=lines.findIndex(l=>/thang điểm 100\b/u.test(l));
    const heading=lines.slice(0,index).reverse().find(l=>/^Điều\s+\d+\b/u.test(l));
    sourceExcerpts[scale.sourceId]=[heading,lines[index]].filter(Boolean).join('\n');
  }
  return {reply:`Theo bảng đã truy xuất, ĐRL được đánh giá trên thang 100 điểm, gồm ${numbered.length} nhóm:\n\n${numbered.map(([n,r])=>`${n}. ${r.label} — tối đa ${r.max} điểm.`).join('\n')}\n\nChưa đủ bằng chứng để xác nhận đây là phiên bản mới nhất hoặc còn hiệu lực hiện hành.`,
    sourceIds:[...new Set([scale.sourceId,...numbered.flatMap(([,r])=>r.sourceIds)])],sourceExcerpts};
};
