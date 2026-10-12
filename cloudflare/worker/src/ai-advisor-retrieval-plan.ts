import {normalizeAdvisorIntentText,isAcademicPolicyQuestion} from './ai-advisor-intents.ts';
import {isConductTableQuestion,conductTableEvidencePriority} from './ai-advisor-table-evidence.ts';
import {conductExcerptSearchQuery,conductExcerptPriority} from './ai-advisor-policy-excerpts.ts';
import type {AiSearchAuthorizedDocument} from './ai-search-retrieval.ts';

/** Input selectors only. No facts/answers/source IDs/page numbers are injected. */
export const tuitionTupleQuery = (question:string) => {
  const q=normalizeAdvisorIntentText(question),cohort=q.match(/\b(?:khoa|k)\s*(\d{2})(?!\d)/)?.[1];
  const major=q.match(/\bnganh\s+(.+?)(?=\s+(?:co|he|hoc phi|bao nhieu|nam hoc|theo|chuong trinh)\b|$)/)?.[1]
    || q.match(/\b(?:khoa|k)\s*\d{2}\s+(.+?)(?=\s+(?:he|chuong trinh|hoc phi|nam hoc)\b)/)?.[1];
  const program=/\b(?:he chuan|chinh quy chuan|chuong trinh chuan)\b/.test(q)?'dai hoc chinh quy chuan'
    :q.match(/\bdai hoc chinh quy(?: chuan| chat luong cao)?\b/)?.[0];
  return /\b(?:hoc phi|muc thu)\b/.test(q)&&cohort&&major?{cohort,major:major.trim(),program}:null;
};
/** Search headings, not fixed article numbers, page IDs or conclusions. */
export const policyHeadingQuery = (question:string) => {
  const q=normalizeAdvisorIntentText(question);
  const conduct=/\b(?:drl|ren luyen)\b/.test(q);
  if(conduct&&/\bdiem\b.*\btoi da\b/.test(q))return {subject:'conduct',query:'Nội dung đánh giá và thang điểm',heading:/noi dung danh gia va thang diem/};
  if(conduct&&/\b(?:ky luat|dinh chi|buoc thoi hoc)\b/.test(q))return {subject:'conduct',query:'Đánh giá đối với các trường hợp đặc thù',heading:/danh gia doi voi cac truong hop dac thu/};
  if(conduct&&/\bxep loai\b/.test(q))return {subject:'conduct',query:'Phân loại kết quả rèn luyện',heading:/phan loai ket qua ren luyen/};
  if(conduct&&/\bkhieu nai\b/.test(q))return {subject:'conduct',query:'Quyền khiếu nại',heading:/quyen khieu nai/};
  if(/\bquy che cong tac sinh vien\b/.test(q)){
    if(/\b(?:ban can su|lop truong|lop pho)\b/.test(q))return {subject:'student_affairs',query:'Tổ chức lớp sinh viên',heading:/to chuc lop sinh vien/};
    if(/\b(?:hut thuoc|uong bia|ruou)\b/.test(q))return {subject:'student_affairs',query:'Các hành vi sinh viên không được làm',heading:/cac hanh vi sinh vien khong duoc lam/};
    if(/\b(?:tam ly|suc khoe)\b/.test(q))return {subject:'student_affairs',query:'Tư vấn tâm lý chăm sóc sức khỏe sinh viên',heading:/tu van tam ly cham soc suc khoe sinh vien/};
  }
  return null;
};
export const articleQuery = (question:string) => {
  const q=normalizeAdvisorIntentText(question),number=q.match(/\bdieu\s+(\d{1,3})\b/)?.[1];
  const subject=/\bquy tac ung xu\b/.test(q)?'conduct_code':/\bquy che cong tac sinh vien\b/.test(q)?'student_affairs':null;
  return number&&subject?{number,subject}:null;
};
/** At most two explicit policy subjects; shared retrieval/read/generation
 * budgets still apply. Never fabricate an answer for the unproved part. */
export const splitPolicyEvidenceQuestions = (question:string):string[] => {
  const q=normalizeAdvisorIntentText(question);
  if(/\b(?:drl|ren luyen)\b/.test(q)&&/\bhoc phi\b/.test(q)){
    const fee=q.indexOf('hoc phi');
    return [q.slice(0,fee).replace(/\bva\s*$/,'').trim(),q.slice(fee)];
  }
  return [question];
};
export const buildEvidenceRetrievalPlan = (question:string,documents:readonly AiSearchAuthorizedDocument[]) => {
  const q=normalizeAdvisorIntentText(question),table=isConductTableQuestion(question),excerpt=conductExcerptSearchQuery(question);
  const tuple=tuitionTupleQuery(question),article=articleQuery(question),policy=policyHeadingQuery(question);
  const academic=isAcademicPolicyQuestion(question);
  const specializedPlan=/\b(?:tieng anh ban phan|chuong trinh dac biet|chuong trinh tinh hoa)\b/.test(q);
  const standardPlan=/\b(?:chinh quy chuan|chuong trinh chuan|he chuan)\b/.test(q);
  let titlePattern:RegExp|null=null;
  if(table||excerpt||policy?.subject==='conduct')titlePattern=/\b(?:quy che|danh gia)\b.*\bren luyen\b/;
  else if(tuple)titlePattern=/\bhoc phi\b/;
  else if(policy?.subject==='student_affairs')titlePattern=/\bquy che cong tac sinh vien\b/;
  else if(article)titlePattern=article.subject==='student_affairs'?/\bquy che cong tac sinh vien\b/:/\bquy tac ung xu\b/;
  else if(academic)titlePattern=/\bke hoach (?:to chuc )?hoc tap\b/;
  // Narrow on explicit document subject only; never truncate arbitrary top N
  // by upload date/category. If metadata does not identify a subject, search
  // the whole authorized set. Private/inactive documents never enter this set.
  const identified=titlePattern?documents.filter(d=>d.active!==false&&titlePattern!.test(normalizeAdvisorIntentText(d.title||''))):[];
  const scoped=academic&&(specializedPlan!==standardPlan)
    ? identified.filter(d=>{const title=normalizeAdvisorIntentText(d.title||'');return specializedPlan
      ? /\b(?:tieng anh ban phan|chuong trinh dac biet|chuong trinh tinh hoa)\b/.test(title)
      : /\bchinh quy chuan\b/.test(title);})
    : identified.length?identified:documents;
  const hydrate=table||Boolean(excerpt||tuple||article||policy)||academic;
  const query=table?'Nội dung đánh giá Khung điểm':excerpt||policy?.query|| (tuple?`Khóa ${tuple.cohort}`
    :article?`Điều ${article.number} ${q.split(/\bdieu\s+\d+\b/)[1]||''}`
    :academic?/\bnghi tet\b/.test(q)?'nghỉ Tết':/\bhoc ky he\b/.test(q)?'Học kỳ hè thời gian đăng ký môn học':/\bdang ky (?:mon hoc|hoc phan|hoc ky)\b/.test(q)?'đăng ký môn học học kỳ '+(q.match(/\b(?:hoc ky|ky)\s+(\d+)\b/)?.[1]||''):/\bthuc tap cuoi khoa\b/.test(q)?'thực tập cuối khóa':/\b(?:hoc ky|ky)\s+\d+\b/.test(q)?'Học kỳ '+q.match(/\b(?:hoc ky|ky)\s+(\d+)\b/)![1]+' thời gian':question.trim().slice(0,1800)
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
      if(policy)return policy.heading.test(n)?5:0;
      if(article)return new RegExp(`\\bdieu ${article.number}\\b`).test(n)?2:0;
      if(academic)return /dang ky mon hoc/.test(n)&&/hoc ky/.test(n)?2:/thuc tap cuoi khoa/.test(n)?1:0;
      return conductExcerptPriority(question,text);
    }};
};
