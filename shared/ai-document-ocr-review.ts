/** Optical output is not authoritative merely because its confidence is high.
 * No dictionary correction, accent folding, fuzzy support or text synthesis. */
export const assessOcrReviewNeed = (text:string,uncertainTokens:number) => {
  const reasons:string[]=[];
  if(uncertainTokens>0||text.includes('[không đọc rõ]'))reasons.push('unreadable_tokens');
  // Do not convert I/l to 1, or supply a missing ordinal: a reviewer must
  // inspect the scan. Roman list items may be legitimate, hence review only.
  if(/^(?:[Il]\.{1,2}|\[không đọc rõ\])\s+/m.test(text))reasons.push('ambiguous_list_marker');
  return {requiresReview:reasons.length>0,reasons};
};

/** Exact token diff for two local OCR passes, NOT quote matching. Bounded DP
 * counts insertions/deletions/substitutions including diacritics/punctuation.
 * It deliberately cannot decide which optical reading is correct. */
export const compareOcrReadings = (baseline:string,trial:string) => {
  const tokens=(s:string)=>s.normalize('NFC').match(/[\p{L}\p{N}]+|[^\p{L}\p{N}\s]/gu)||[];
  const a=tokens(baseline),b=tokens(trial);
  if(a.length>2000||b.length>2000)throw Error('OCR_DIFF_TOKEN_LIMIT');
  let prev=Uint16Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const row=new Uint16Array(b.length+1);row[0]=i;
    for(let j=1;j<=b.length;j++)row[j]=Math.min(row[j-1]+1,prev[j]+1,prev[j-1]+Number(a[i-1]!==b[j-1]));
    prev=row;
  }
  return {baselineTokens:a.length,trialTokens:b.length,tokenEditDistance:prev[b.length],
    readingsAgree:prev[b.length]===0,accuracyVerified:false as const};
};

/** Review proposal only. It grants no publication/index promotion authority.
 * Original bytes and old revision remain immutable; approval must be captured
 * server-side from an authenticated admin after side-by-side PDF inspection. */
export const buildOcrReviewDraft = (input:{sourceHash:string;baseRevision:string;pageNumber:number;
  baselineText:string;trialText:string;trialUncertainTokens:number;method:string}) => {
  if(!/^[a-f0-9]{64}$/.test(input.sourceHash)||!/^v\d+-[a-f0-9]{32}$/.test(input.baseRevision)
    ||!Number.isInteger(input.pageNumber)||input.pageNumber<1||input.pageNumber>40
    ||!Number.isSafeInteger(input.trialUncertainTokens)||input.trialUncertainTokens<0
    ||!input.baselineText.trim()||!input.trialText.trim()||input.baselineText.length>8000||input.trialText.length>8000
    ||!input.method.trim()||input.method.length>128)throw Error('INVALID_OCR_REVIEW_DRAFT');
  return {...input,comparison:compareOcrReadings(input.baselineText,input.trialText),
    quality:assessOcrReviewNeed(input.trialText,input.trialUncertainTokens),
    status:'pending_admin_review' as const,approved:false as const,
    originalAction:'READ_ONLY' as const,oldRevisionAction:'RETAIN_IMMUTABLE' as const,
    promotionAllowed:false as const};
};
