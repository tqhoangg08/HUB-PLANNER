/** Structural counters only; no content, identity, URLs or raw errors. */
export type AdvisorProviderUsage = {inputTokens:number|null;outputTokens:number|null};
const tokens=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
export const readAdvisorProviderUsage=(value:unknown):AdvisorProviderUsage=>{
  const r=value&&typeof value==='object'?value as Record<string,unknown>:{};
  return{inputTokens:tokens(r.promptTokenCount??r.prompt_tokens),outputTokens:tokens(r.candidatesTokenCount??r.completion_tokens)};
};
export type AdvisorReleaseEvent={
  event:'ai_advisor_request_completed';request_id:string;canary_trace_id:string|null;
  grounding_result:'VALIDATED_DOCUMENT'|'SAFE_ABSTENTION'|'STRUCTURED_OR_GENERAL'|'REQUEST_ERROR';
  fallback:boolean;timeout:boolean;latency_ms:number;r2_reads:number;search_calls:number;
  workers_ai_calls:number;gemini_calls:number;general_ai_calls:number;
  input_tokens:number|null;output_tokens:number|null;provider_reported_cost_usd:null;
};
export const createAdvisorReleaseMetrics=()=>{
  const started=Date.now();let closed=false,input:number|null=null,output:number|null=null;
  const event:AdvisorReleaseEvent={event:'ai_advisor_request_completed',request_id:crypto.randomUUID(),canary_trace_id:null,
    grounding_result:'REQUEST_ERROR',fallback:false,timeout:false,latency_ms:0,r2_reads:0,search_calls:0,
    workers_ai_calls:0,gemini_calls:0,general_ai_calls:0,input_tokens:null,output_tokens:null,provider_reported_cost_usd:null};
  return{event,
    count(key:'r2_reads'|'search_calls'|'workers_ai_calls'|'gemini_calls'|'general_ai_calls',n=1){if(!closed)event[key]+=Math.max(0,Math.trunc(n));},
    usage(u:AdvisorProviderUsage|undefined){if(closed||!u)return;if(u.inputTokens!==null)input=(input??0)+u.inputTokens;if(u.outputTokens!==null)output=(output??0)+u.outputTokens;},
    finish(){closed=true;return{...event,latency_ms:Math.max(0,Date.now()-started),input_tokens:input,output_tokens:output};},
  };
};
