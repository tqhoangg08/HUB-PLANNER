import {normalizeAdvisorIntentText} from './ai-advisor-intents.ts';
import type {AuthorizedEvidenceSource} from './ai-advisor-evidence.ts';

export const TUITION_SCOPE_QUESTION='Bạn vui lòng cho biết khóa tuyển sinh và hệ/chương trình đào tạo để tôi xác định đúng dòng học phí. Đoạn nguồn hiện có chưa đủ ngữ cảnh để xác nhận mức thu của ngành này.';
/** Input identity, not a catalog of majors or monetary facts. */
export function tuitionMajorQuery(question:string){
  const q=normalizeAdvisorIntentText(question).replace(/-/g,' ').replace(/\s+/g,' ');
  if(!/\b(?:hoc phi|muc thu)\b/.test(q))return null;
  const major=q.match(/\bnganh\s+(.+?)(?=\s+(?:la|bao nhieu|khoa|he|chuong trinh|nam hoc|nam 20|theo|co|thi|duoc|a)\b|$)/)?.[1]?.trim();
  if(!major||major.length<3||major.length>100)return null;
  const cohort=q.match(/\b(?:khoa|k)\s*(20\d{2}|\d{2})(?!\d)/)?.[1];
  const program=/\b(?:he chuan|chinh quy chuan|chuong trinh chuan)\b/.test(q)?'chinh quy chuan'
    :q.match(/\b(?:tieng anh ban phan|chuong trinh dac biet|chuong trinh tinh hoa|chat luong cao)\b/)?.[0];
  const year=q.match(/\b20\d{2}[\s-]+20\d{2}\b/)?.[0];
  const scopeUnresolved=/\b(?:he|chuong trinh|dai hoc)\b/.test(q)&&!program
    ||/\bnam(?: hoc)?\s+20\d{2}\b/.test(q)&&!year;
  const unit=/\btin chi\b/.test(q)?'tin chi':/\b(?:theo nam|moi nam|dong nam)\b/.test(q)?'nam':undefined;
  return {major,cohort,program,year,unit,scopeUnresolved};
}
const cells=(line:string)=>line.trim().startsWith('|')?line.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim())
  :line.includes('\t')?line.split('\t').map(c=>c.trim()):[];
const text=(value:string)=>value.replace(/<br\s*\/?\s*>/gi,' ').trim();
const norm=(value:string)=>normalizeAdvisorIntentText(text(value)).replace(/-/g,' ').replace(/\s+/g,' ');
const money=(value:string)=>/^\d{1,3}(?:[.,]\d{3})+(?:\s*(?:đ|đồng|vnđ|vnd))?$/iu.test(value);
const md=(value:string)=>text(value).replace(/[\\`*_{}[\]()<>#+|~]/g,'\\$&');
type FeeRow={sourceId:string;documentId:string;program:string;cohort:string;year:string;major:string;fees:string[];units:string[];excerpt:string};

/** Only same-table context. Never carry a header across a missing unit/table.
 * All source excerpts retain original bytes; formatting is a separate step. */
export function resolveTuitionMajorAnswer(question:string,evidence:readonly AuthorizedEvidenceSource[]){
  const query=tuitionMajorQuery(question);if(!query)return null;
  if(query.scopeUnresolved)return {reply:TUITION_SCOPE_QUESTION,sourceIds:[] as string[],sourceExcerpts:{} as Record<string,string>};
  const rows:FeeRow[]=[];let incomplete=false;
  for(const source of evidence){
    let header:string[]=[];let headerLine='',program='',cohort='',year='',locator='';
    let programLine='',cohortLine='',yearLine='';
    const reset=()=>{header=[];headerLine='';program='';cohort='';year='';programLine='';cohortLine='';yearLine='';locator='';};
    for(const line of source.snippet.split('\n')){
      const n=norm(line),c=cells(line),cn=c.map(norm);
      if(/^(?:bang\s+\d+|phu luc\b|(?:dieu|khoan|muc|chuong)\s+(?:\d+|[ivx]+)\b)/i.test(n)||/^#{1,6}\s/.test(line)){
        reset();locator=line;
      }
      if(!c.length){
        if(/^(?:dai hoc|he |chuong trinh )/.test(n)){program=text(line);programLine=line;cohort='';cohortLine='';continue;}
        const k=n.match(/^khoa\s+(20\d{2}|\d{2})$/);if(k){cohort=k[1];cohortLine=line;continue;}
        if(/\bnam hoc\b/.test(n)&&/\b20\d{2}[\s-]+20\d{2}\b/.test(n)){year=line.match(/20\d{2}\s*[-–/]\s*20\d{2}/)?.[0]||'';yearLine=line;continue;}
        if(n&&header.length)reset();
        continue;
      }
      if(cn.some(v=>/\bnganh\b/.test(v))&&cn.some(v=>/\b(?:hoc phi|muc thu|dong|vnd)\b/.test(v)&&/\b(?:nam|tin chi|hoc ky)\b/.test(v))){if(headerLine)reset();header=c;headerLine=line;continue;}
      if(cn[1]&&/^(?:dai hoc|he |chuong trinh )/.test(cn[1])&&c.slice(2).every(v=>!v)){program=text(c[1]);programLine=line;cohort='';cohortLine='';}
      const k=cn[0]?.match(/^khoa(?:\s+(20\d{2}|\d{2}))?$/);
      if(k){cohort=k[1]||(/^(?:20\d{2}|\d{2})$/.test(c[1]||'')?c[1]:'');cohortLine=line;}
      const majorIndex=header.findIndex(v=>/\bnganh\b/.test(norm(v)));
      const fallbackMajor=c.findIndex(v=>norm(v).replace(/^nganh\s+/,'').replace(/\s+moi$/,'')===query.major);
      if(fallbackMajor<0)continue;
      if(!header.length||c.length!==header.length||majorIndex<0||majorIndex!==fallbackMajor){incomplete=true;continue;}
      const get=(pattern:RegExp)=>{const i=header.findIndex(v=>pattern.test(norm(v)));return i>=0?text(c[i]):'';};
      const rowProgram=get(/\b(?:chuong trinh|he dao tao)\b/)||program;
      const cohortCell=get(/^khoa\b/);
      const rowCohort=cohortCell?(norm(cohortCell).match(/^(?:(?:khoa|k)\s*)?(20\d{2}|\d{2})$/)?.[1]||''):cohort;
      const rowYear=get(/nam hoc/)||year;
      const feeColumns=header.flatMap((v,i)=>/\b(?:hoc phi|muc thu|dong|vnd)\b/.test(norm(v))&&/\b(?:nam|tin chi|hoc ky)\b/.test(norm(v))&&(!query.unit||norm(v).includes(query.unit))?[i]:[]);
      if(!rowProgram||!rowCohort||/khong doc ro|chua xac dinh/.test(norm(rowProgram))||!feeColumns.length||feeColumns.length>2||feeColumns.some(i=>!money(text(c[i])))){incomplete=true;continue;}
      if(query.cohort&&rowCohort!==query.cohort||query.program&&!norm(rowProgram).includes(query.program)||query.year&&norm(rowYear)!==query.year)continue;
      rows.push({sourceId:source.sourceId,documentId:source.documentId,program:rowProgram,cohort:rowCohort,year:rowYear,major:text(c[majorIndex]),
        fees:feeColumns.map(i=>text(c[i])),units:feeColumns.map(i=>text(header[i])),
        excerpt:[locator,programLine,cohortLine,yearLine,headerLine,line].filter(Boolean).join('\n')});
    }
  }
  const unique=[...new Map(rows.map(r=>[JSON.stringify([r.documentId,r.program,r.cohort,r.year,r.fees,r.units]),r])).values()];
  // Multiple sources have no inferred precedence; partial rows may conceal a
  // competing rate. Ask rather than making a uniqueness claim from partial data.
  if(incomplete||!unique.length||unique.length>4||new Set(unique.map(r=>r.documentId)).size!==1)return {reply:TUITION_SCOPE_QUESTION,sourceIds:[] as string[],sourceExcerpts:{} as Record<string,string>};
  const signatures=new Map<string,string>();
  for(const row of unique){const key=JSON.stringify([row.program,row.cohort,row.year,row.units]),value=JSON.stringify(row.fees);
    if(signatures.has(key)&&signatures.get(key)!==value)return {reply:TUITION_SCOPE_QUESTION,sourceIds:[],sourceExcerpts:{}};
    signatures.set(key,value);
  }
  const body=unique.flatMap(row=>row.fees.map((fee,i)=>`| ${md(row.major)} | ${md(row.program)} · khóa ${row.cohort}${row.year?` · ${row.year}`:''} | ${md(row.units[i])} | ${md(fee)} |`));
  const row=unique[0];
  const reply=unique.length===1&&row.fees.length===1
    ?`Mức học phí của **${md(row.major)}** là **${md(row.fees[0])}**, theo **${md(row.units[0])}**; phạm vi **${md(row.program)}, khóa ${row.cohort}${row.year?`, ${row.year}`:''}**.`
    :`Các dòng học phí phù hợp trong nguồn đã truy xuất:\n\n| Ngành | Phạm vi | Đơn vị theo bảng nguồn | Mức thu |\n| --- | --- | --- | --- |\n${body.join('\n')}`;
  return {reply:`${reply}\n\nChưa xác nhận phiên bản mới nhất hoặc hiệu lực hiện hành ngoài nội dung tài liệu đã công bố.`,
    sourceIds:[...new Set(unique.map(r=>r.sourceId))],sourceExcerpts:Object.fromEntries([...new Set(unique.map(r=>r.sourceId))].map(id=>[id,unique.filter(r=>r.sourceId===id).map(r=>r.excerpt).join('\n')]))};
}
