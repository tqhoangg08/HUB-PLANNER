import {normalizeAdvisorIntentText} from './ai-advisor-intents.ts';
import {articleQuery,tuitionTupleQuery} from './ai-advisor-retrieval-plan.ts';
import type {AuthorizedEvidenceSource} from './ai-advisor-evidence.ts';

/** Locate original bytes by line offsets; selection NEVER normalizes a quote. */
export const selectEvidenceWindow = (text:string,question:string,limit:number) => {
  if(text.length<=limit)return text;
  const q=normalizeAdvisorIntentText(question),tuple=tuitionTupleQuery(question),article=articleQuery(question);
  let offset=0,bestOffset=0,best=0;
  for(const line of text.split('\n')){
    const n=normalizeAdvisorIntentText(line);
    const score=article?Number(new RegExp(`\\bdieu ${article.number}\\b`).test(n))*5
      :tuple?Number(new RegExp(`\\bkhoa\\s+${tuple.cohort}\\b`).test(n))*5
      :/\bdang ky (?:mon hoc|hoc phan)\b/.test(q)?Number(/thoi gian dang ky mon hoc/.test(n))*5
      :/\bnghi tet\b/.test(q)?Number(/nghi tet.*\d/.test(n))*5
      :/\bthuc tap\b/.test(q)?Number(/thuc tap cuoi khoa/.test(n))*5:0;
    if(score>best){best=score;bestOffset=offset;}offset+=line.length+1;
  }
  const start=Math.max(0,Math.min(bestOffset,text.length-limit));
  return text.slice(start,start+limit);
};
const quote=(text:string)=>`> ${text.replace(/\n/g,'\n> ')}`;
const note='Trích nguyên văn dữ liệu đã truy xuất; chưa xác minh phiên bản mới nhất/hiệu lực. Ký tự chưa rõ cần đối chiếu tài liệu gốc.';

/** A continued fee table can lack its own topic heading. Require a retrieved,
 * authorized adjacent header page, literal cohort/major and numeric cells.
 * This only selects evidence; it never changes support matching. */
type PageEvidence=Pick<AuthorizedEvidenceSource,'documentId'|'pageNumber'|'snippet'>;
export const isTuitionContinuationEvidence = (question:string,source:PageEvidence,evidence:readonly PageEvidence[]) => {
  const tuple=tuitionTupleQuery(question);if(!tuple?.program||!source.pageNumber)return false;
  const header=evidence.find(s=>s.documentId===source.documentId&&s.pageNumber===source.pageNumber!-1
    &&/hoc phi theo nam/.test(normalizeAdvisorIntentText(s.snippet))
    &&/hoc phi theo tin chi/.test(normalizeAdvisorIntentText(s.snippet))
    &&normalizeAdvisorIntentText(s.snippet).includes(tuple.program!));
  if(!header)return false;
  const n=normalizeAdvisorIntentText(source.snippet);
  return source.snippet.split('\n').some(line=>{const cells=line.split('|').slice(1,-1).map(c=>c.trim());return cells.length===4&&normalizeAdvisorIntentText(cells[0])==='khoa'&&cells[1]===tuple.cohort;})
    &&n.includes(`nganh ${tuple.major}`)&&/\|\s*\d{1,3}(?:[.,]\d{3})+\s*\|\s*\d{1,3}(?:[.,]\d{3})+\s*\|/.test(source.snippet);
};

/** Lossless academic milestone extraction: require section + semester row on
 * the SAME authorized page. Never infer a date from a neighboring semester. */
export const resolveAcademicMilestone = (question:string,evidence:readonly AuthorizedEvidenceSource[]) => {
  const q=normalizeAdvisorIntentText(question);if(!/\bke hoach (?:to chuc )?hoc tap\b/.test(q))return null;
  const term=q.match(/\bhoc ky\s+(\d+)\b/)?.[1];
  const registration=/\bdang ky (?:mon hoc|hoc phan)\b/.test(q);
  const candidates=evidence.flatMap(s=>{
    const lines=s.snippet.split('\n');
    if(s.locatorKind==='word_unit'){
      let header='',table='',heading='';const found:Array<{text:string;sourceId:string;excerpt:string}>=[];
      for(const line of lines){
        const n=normalizeAdvisorIntentText(line);
        if(/^Bảng \d+ \(thứ tự bảng trong DOCX\)/.test(line))table=line;
        if(/^(?:[IVXLCDM]+|\d+\.\d+)\.\s+\S/u.test(line))heading=line;
        if(/thoi gian dang ky mon hoc/.test(n))header=line;
        const semester=term&&new RegExp(`\\b(?:hoc ky\\s*|hk)${term}\\b`).test(n);
        const literalDate=/\b(?:\d{1,2}\/)?\d{1,2}\/\d{4}\b/.test(line);
        const literalRegistration=registration&&semester&&literalDate
          &&(/dang ky hoc phan/.test(n)||Boolean(header)&&/^\|/.test(line)&&/^hoc ky\b/.test(n));
        const literalHoliday=/\bnghi tet\b/.test(q)&&/nghi tet/.test(n)
          &&(line.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g)||[]).length===2;
        if((literalRegistration||literalHoliday)&&!n.includes('khong doc ro'))found.push({text:line,sourceId:s.sourceId,
          excerpt:[/^\|/.test(line)?table:heading,literalRegistration?header:'',line].filter(Boolean).join('\n')});
      }
      return found;
    }
    if(registration&&term){
      const start=lines.findIndex(l=>/thoi gian dang ky mon hoc/.test(normalizeAdvisorIntentText(l)));if(start<0)return[];
      const block=lines.slice(start+1).join('\n').split(/\n\d+\.\s/)[0];
      const matches=block.split('\n').filter(l=>new RegExp(`^hoc ky ${term}\\b`).test(normalizeAdvisorIntentText(l))
        &&/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(l)&&!l.includes('[không đọc rõ]'));
      return matches.map(text=>({text,sourceId:s.sourceId,excerpt:text}));
    }
    if(/\bthuc tap cuoi khoa\b/.test(q))return lines.filter(l=>/thuc tap cuoi khoa.*\d+ tuan/.test(normalizeAdvisorIntentText(l))&&!l.includes('[không đọc rõ]')).map(text=>({text,sourceId:s.sourceId,excerpt:text}));
    return[];
  });
  if(!candidates.length||new Set(candidates.map(c=>c.text.trim())).size!==1)return null;
  return{reply:`Theo dòng trong kế hoạch đã truy xuất:\n\n${quote(candidates[0].text.trim())}\n\n${note}`,sourceIds:[candidates[0].sourceId],sourceExcerpts:{[candidates[0].sourceId]:candidates[0].excerpt}};
};

/** Requested article only, original text/unclear markers unchanged. Never
 * repairs OCR spelling or claims completeness/currentness of uncertain text.
 * A partial source excerpt is not acceptance of a generated paraphrase. */
export const resolvePolicyArticleExcerpt = (question:string,evidence:readonly AuthorizedEvidenceSource[]) => {
  const article=articleQuery(question);if(!article)return null;
  const q=normalizeAdvisorIntentText(question);
  // A decision and its attached regulation can both contain Article3. Match
  // the heading subject explicitly requested by the user, not just a number.
  const subjects=['trach nhiem','ban than','gia dinh','xa hoi','nguyen tac'].filter(term=>q.includes(term));
  const candidates=evidence.flatMap(s=>{
    const lines=s.snippet.split('\n'),start=lines.findIndex(l=>new RegExp(`^dieu ${article.number}\\b`).test(normalizeAdvisorIntentText(l)));
    if(start<0)return[];
    if(subjects.some(term=>!normalizeAdvisorIntentText(lines[start]).includes(term)))return[];
    let end=start+1;while(end<lines.length&&!/^(?:dieu \d+\b|chuong [ivx]+\b)/.test(normalizeAdvisorIntentText(lines[end]))&&!/^```/.test(lines[end]))end++;
    const text=lines.slice(start,end).join('\n').trim();
    if(text.length<80||text.length>1500)return[];
    return[{text,sourceId:s.sourceId}];
  });
  if(!candidates.length||new Set(candidates.map(c=>c.text)).size!==1)return null;
  const c=candidates[0];
  const native=evidence.find(s=>s.sourceId===c.sourceId)?.locatorKind==='word_unit';
  return{reply:`Đoạn điều khoản đã truy xuất (${native?'nguyên văn Word':'nguyên văn OCR'}, không tự sửa chữ):\n\n${quote(c.text)}\n\n${note}${native?'':' Không suy diễn phần chưa đọc rõ; đây không phải xác nhận đầy đủ nội dung khi OCR còn lỗi.'}`,sourceIds:[c.sourceId],sourceExcerpts:{[c.sourceId]:c.text}};
};

/** Native Word fee tables use literal cohort headings in the first cell.
 * Never borrow program/cohort/units from another unit or document. Original
 * order inside one unit can span adjacent Word tables; no physical page is
 * invented and conflicting matching rows fail closed. */
const resolveWordTuitionTableRow=(question:string,evidence:readonly AuthorizedEvidenceSource[])=>{
  const tuple=tuitionTupleQuery(question);if(!tuple?.program)return null;
  const matches:Array<{row:string;header:string;program:string;cohort:string;sourceId:string;excerpt:string}>=[];
  for(const source of evidence.filter(s=>s.locatorKind==='word_unit')){
    let header='',program='',cohort='',table='',programLine='',cohortLine='';
    for(const line of source.snippet.split('\n')){
      if(/^Bảng \d+ \(thứ tự bảng trong DOCX\)/.test(line))table=line;
      const cells=line.split('|').slice(1,-1).map(c=>c.trim());if(cells.length!==4)continue;
      const normalized=cells.map(c=>normalizeAdvisorIntentText(c.replace(/<br\s*\/?\s*>/g,' ')));
      if(/hoc phi theo nam/.test(normalized[2])&&/hoc phi theo tin chi/.test(normalized[3])){header=line;program='';cohort='';}
      if(!cells[2]&&!cells[3]&&/^(?:dai hoc|thac si|tien si)\b/.test(normalized[1])){program=cells[1];programLine=line;cohort='';}
      if(/^khoa\s+\d{2}\b/.test(normalized[0])){cohort=normalized[0].match(/^khoa\s+(\d{2})\b/)![1];cohortLine=line;}
      if(!header||normalizeAdvisorIntentText(program)!==tuple.program||cohort!==tuple.cohort||normalized[1]!==`nganh ${tuple.major}`)continue;
      if(!/^\d{1,3}(?:[.,]\d{3})+$/.test(cells[2])||!/^\d{1,3}(?:[.,]\d{3})+$/.test(cells[3]))continue;
      matches.push({row:`| ${cells[1]} | ${cells[2]} | ${cells[3]} |`,header,program,cohort,sourceId:source.sourceId,
        excerpt:[header,programLine,table,cohortLine,line].join('\n')});
    }
  }
  if(!matches.length||new Set(matches.map(m=>JSON.stringify([m.row,m.header,m.program,m.cohort]))).size!==1)return null;
  const m=matches[0],cells=m.header.split('|').slice(1,-1);
  return{reply:`Dòng học phí trong bảng đã truy xuất — ${m.program}, khóa ${m.cohort}:\n\n| Ngành | ${cells[2].trim()} | ${cells[3].trim()} |\n| --- | --- | --- |\n${m.row}\n\n${note}`,sourceIds:[m.sourceId],sourceExcerpts:{[m.sourceId]:m.excerpt}};
};

/** Tuple and units/program must be proven by the SAME physical table, with
 * adjacent page continuation only. Unknown cells outside the selected row do
 * not excuse guessing selected numeric/name/units cells. No expected values. */
export const resolveTuitionTableRow = (question:string,evidence:readonly AuthorizedEvidenceSource[]) => {
  const tuple=tuitionTupleQuery(question);if(!tuple?.program)return null;
  if(evidence.some(s=>s.locatorKind==='word_unit'))return resolveWordTuitionTableRow(question,evidence);
  const physicalPages=new Map<string,string>();
  for(const s of evidence){const key=JSON.stringify([s.documentId,s.pageNumber]);if(physicalPages.has(key)&&physicalPages.get(key)!==s.snippet)return null;physicalPages.set(key,s.snippet);}
  const matches:Array<{row:string;cohort:string;header:string;program:string;sourceIds:string[]}>=[];
  for(const documentId of new Set(evidence.map(s=>s.documentId))){
    let context:{header:string;program:string;sourceId:string}|null=null,cohort='',cohortSource='',previous:number|undefined;
    for(const s of evidence.filter(e=>e.documentId===documentId).sort((a,b)=>(a.pageNumber||0)-(b.pageNumber||0))){
      if(previous!==undefined&&s.pageNumber!==previous+1){context=null;cohort='';}
      previous=s.pageNumber;
      for(const line of s.snippet.split('\n')){
        const cells=line.split('|').slice(1,-1).map(c=>c.trim());if(cells.length!==4)continue;
        const n=normalizeAdvisorIntentText(cells[1].replace(/<br\s*\/?\s*>/g,' '));
        if(/hoc phi theo nam/.test(normalizeAdvisorIntentText(cells[2]))&&/hoc phi theo tin chi/.test(normalizeAdvisorIntentText(cells[3])))context={header:line,program:'',sourceId:s.sourceId};
        if(!cells[2]&&!cells[3]&&/dai hoc|thac si|tien si/.test(n)){
          cohort='';if(context)context.program=cells[1];
        }
        if(normalizeAdvisorIntentText(cells[0])==='khoa'){cohort=cells[1];cohortSource=s.sourceId;}
        if(!context||normalizeAdvisorIntentText(context.program)!==tuple.program||cohort!==tuple.cohort||n!==`nganh ${tuple.major}`)continue;
        if(!/^\d{1,3}(?:[.,]\d{3})+$/.test(cells[2])||!/^\d{1,3}(?:[.,]\d{3})+$/.test(cells[3]))continue;
        // STT may be unreadable; it is not used as a fee/cohort fact.
        if([cells[1],cells[2],cells[3]].some(c=>c.includes('[không đọc rõ]')))continue;
        matches.push({row:`| ${cells[1]} | ${cells[2]} | ${cells[3]} |`,header:context.header,program:context.program,cohort,sourceIds:[context.sourceId,cohortSource,s.sourceId]});
      }
    }
  }
  if(!matches.length||new Set(matches.map(m=>JSON.stringify([m.row,m.program,m.cohort,m.header]))).size!==1)return null;
  const m=matches[0],cells=m.header.split('|').slice(1,-1);
  return{reply:`Dòng học phí trong bảng đã truy xuất — ${m.program}, khóa ${m.cohort}:\n\n| Ngành | ${cells[2].trim()} | ${cells[3].trim()} |\n| --- | --- | --- |\n${m.row}\n\n${note}`,sourceIds:[...new Set(m.sourceIds)]};
};
