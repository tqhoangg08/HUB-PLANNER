import {normalizeAdvisorIntentText} from './ai-advisor-intents.ts';
import {isConductTableQuestion,conductTableEvidencePriority} from './ai-advisor-table-evidence.ts';
import {conductExcerptSearchQuery,conductExcerptPriority} from './ai-advisor-policy-excerpts.ts';
import type {AiSearchAuthorizedDocument} from './ai-search-retrieval.ts';

/** Input selectors only. No facts/answers/source IDs/page numbers are injected. */
export const tuitionTupleQuery = (question:string) => {
  const q=normalizeAdvisorIntentText(question),cohort=q.match(/\b(?:khoa|k)\s*(\d{2})(?!\d)/)?.[1];
  const major=q.match(/\bnganh\s+(.+?)(?=\s+(?:co|hoc phi|bao nhieu|nam hoc|theo|chuong trinh)\b|$)/)?.[1];
  const program=q.match(/\bdai hoc chinh quy(?: chuan| chat luong cao)?\b/)?.[0];
  return /\bhoc phi\b/.test(q)&&cohort&&major?{cohort,major,program}:null;
};
export const articleQuery = (question:string) => {
  const q=normalizeAdvisorIntentText(question),number=q.match(/\bdieu\s+(\d{1,3})\b/)?.[1];
  const subject=/\bquy tac ung xu\b/.test(q)?'conduct_code':/\bquy che cong tac sinh vien\b/.test(q)?'student_affairs':null;
  return number&&subject?{number,subject}:null;
};
export const buildEvidenceRetrievalPlan = (question:string,documents:readonly AiSearchAuthorizedDocument[]) => {
  const q=normalizeAdvisorIntentText(question),table=isConductTableQuestion(question),excerpt=conductExcerptSearchQuery(question);
  const tuple=tuitionTupleQuery(question),article=articleQuery(question);
  const academic=/\bke hoach (?:to chuc )?hoc tap\b/.test(q);
  const specializedPlan=/\b(?:tieng anh ban phan|chuong trinh dac biet|chuong trinh tinh hoa)\b/.test(q);
  const standardPlan=!specializedPlan&&/\b(?:chinh quy chuan|chuong trinh chuan)\b/.test(q);
  let titlePattern:RegExp|null=null;
  if(table||excerpt)titlePattern=/\b(?:quy che|danh gia)\b.*\bren luyen\b/;
  else if(tuple)titlePattern=/\bhoc phi\b/;
  else if(article)titlePattern=article.subject==='student_affairs'?/\bquy che cong tac sinh vien\b/:/\bquy tac ung xu\b/;
  else if(academic)titlePattern=/\bke hoach (?:to chuc )?hoc tap\b/;
  // Narrow on explicit document subject only; never truncate arbitrary top N
  // by upload date/category. If metadata does not identify a subject, search
  // the whole authorized set. Private/inactive documents never enter this set.
  const identified=titlePattern?documents.filter(d=>d.active!==false&&titlePattern!.test(normalizeAdvisorIntentText(d.title||''))):[];
  const scoped=academic&&(specializedPlan||standardPlan)
    ? identified.filter(d=>{const title=normalizeAdvisorIntentText(d.title||'');return specializedPlan
      ? /\b(?:tieng anh ban phan|chuong trinh dac biet|chuong trinh tinh hoa)\b/.test(title)
      : /\bchinh quy chuan\b/.test(title);})
    : identified.length?identified:documents;
  const hydrate=table||Boolean(excerpt||tuple||article)||academic;
  const query=table?'Nội dung đánh giá Khung điểm':excerpt|| (tuple?`Khóa ${tuple.cohort}`
    :article?`Điều ${article.number} ${q.split(/\bdieu\s+\d+\b/)[1]||''}`
    :academic?/\bdang ky (?:mon hoc|hoc phan)\b/.test(q)?'đăng ký môn học học kỳ '+(q.match(/\bhoc ky\s+(\d+)\b/)?.[1]||''):/\bthuc tap cuoi khoa\b/.test(q)?'thực tập cuối khóa':question.trim().slice(0,1800)
    :question.trim().slice(0,1800));
  return {scoped,hydrate,table,query,tuple,article,academic,
    // One bounded semantic/lexical pass plus a table-header pass ONLY for
    // scoped tuition rows: units/program cannot be inferred from bare numbers.
    headerQuery:tuple?'Học phí theo năm Học phí theo tín chỉ '+(tuple.program||''):null,
    priority:(text:string)=>{
      const n=normalizeAdvisorIntentText(text);
      if(table)return conductTableEvidencePriority(text);
      if(tuple){const cohort=new RegExp(`\\b(?:khoa|k)\\s+${tuple.cohort}\\b`).test(n);
        return (cohort?4:0)+(n.includes(tuple.major)?1:0)+(/hoc phi theo nam/.test(n)&&/hoc phi theo tin chi/.test(n)?3+(tuple.program&&n.includes(tuple.program)?4:0):0);}
      if(article)return new RegExp(`\\bdieu ${article.number}\\b`).test(n)?2:0;
      if(academic)return /dang ky mon hoc/.test(n)&&/hoc ky/.test(n)?2:/thuc tap cuoi khoa/.test(n)?1:0;
      return conductExcerptPriority(question,text);
    }};
};
