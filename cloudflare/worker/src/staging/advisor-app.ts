/** Isolated acceptance app. This entrypoint is never referenced by production Wrangler. */
import {createAuthForProfile,handleInternalSession,allowsIntegrationSyntheticCredentialRequest,type AuthRuntimeProfile,type AuthRuntimeEnv} from '../../../auth-production-worker/src/auth-production.ts';
import {handleAdminAiDocuments,handleAiDocumentFile,handleAiDocumentSource, type AiDocumentsEnv} from '../ai-documents.ts';
import {handleAiAdvisor,aiAdvisorErrorStatus,type AiAdvisorEnv} from '../ai-advisor.ts';
import {requireBetterAuthSession} from '../better-auth-identity.ts';
import {buildDerivedPageObjectKey,buildServerDerivedMetadata} from '../ai-document-ingestion.ts';
import {handlePrivatePolicyConsent} from '../private-policy-consent.ts';
type StageEnv = {
  DB:D1Database; AUTH_DB:D1Database; AI_DOCUMENTS_BUCKET:R2Bucket; ASSETS:Fetcher; AI:Ai;
  STAGING_AI_SEARCH:AiSearchInstance; STAGING_ORIGIN:string; STAGING_SYNTHETIC_EMAIL:string;
  AUTH_BETTER_AUTH_SECRET:string; GEMINI_FILE_SEARCH_API_KEY?:string; GEMINI_FILE_SEARCH_STORE?:string;
};
const INSTANCE='hub-advisor-pr88-app-staging';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export default {
  async fetch(request:Request,env:StageEnv,ctx:ExecutionContext){
    const url=new URL(request.url);
    if(url.origin!==env.STAGING_ORIGIN||!/^https:\/\/hub-advisor-pr88-app-staging\.[a-z0-9-]+\.workers\.dev$/u.test(url.origin))return json({error:'STAGING_ISOLATION_REQUIRED'},503);
    const profile:AuthRuntimeProfile={kind:'integration-synthetic-credential',appName:'HUB Advisor PR88 isolated staging',origin:url.origin,trustedOrigins:[url.origin],
      cookiePrefix:'hub_pr88_staging',serviceName:'pr88-staging-inline-existing-auth',routeSurface:'integration-synthetic-session-lifecycle',providers:'none',
      resetPage:`${url.origin}/reset-password`,expectedHostname:url.hostname,eligibilityPolicy:'integration-synthetic-user',emailBrand:'integration-test',syntheticSignInEmail:env.STAGING_SYNTHETIC_EMAIL};
    const authEnv:AuthRuntimeEnv={AUTH_DB:env.AUTH_DB,AUTH_ENABLED:'true',AUTH_BETTER_AUTH_SECRET:env.AUTH_BETTER_AUTH_SECRET};
    const auth=createAuthForProfile(authEnv,ctx,profile);
    const instance=env.STAGING_AI_SEARCH;
    const bridge={fetch:(r:Request)=>handleInternalSession(r,authEnv,auth,new URL(r.url).pathname.endsWith('/staff'))} as unknown as Fetcher;
    const shared:AiDocumentsEnv={DB:env.DB,AI_DOCUMENTS_BUCKET:env.AI_DOCUMENTS_BUCKET,AUTH_SERVICE:bridge,
      GEMINI_FILE_SEARCH_API_KEY:env.GEMINI_FILE_SEARCH_API_KEY,GEMINI_FILE_SEARCH_STORE:env.GEMINI_FILE_SEARCH_STORE,
      // Production code uses its production alias; resolve ONLY to this private instance.
      AI_ADVISOR_SEARCH:{get:()=>instance}};
    try{
      if(url.pathname==='/health')return json({stage:true,productionBindings:false});
      if(url.pathname.startsWith('/api/auth/')){
        if(!await allowsIntegrationSyntheticCredentialRequest(request,profile))return json({error:'Not found'},404);
        return auth.handler(request);
      }
      if(url.pathname==='/api/private/v1/me')return json(await requireBetterAuthSession(request,shared));
      if(url.pathname==='/api/user/v1/policy-consents')return json(await handlePrivatePolicyConsent(request,shared));
      if(url.pathname==='/api/admin/v1/ai-documents'){
        const result=await handleAdminAiDocuments(request,url,shared);
        if(request.method==='POST'&&'document' in result&&result.document){
          const d=result.document as Record<string,unknown>;
          // The backend has verified PDF hash/page contract and written this
          // new D1/R2 revision. Stage indexes only those server-owned objects.
          if(d.ai_search_revision&&Number(d.ocr_page_count)<=40){
            for(let page=1;page<=Number(d.ocr_page_count);page++){
              const key=buildDerivedPageObjectKey(String(d.id),String(d.ai_search_revision),page),object=await env.AI_DOCUMENTS_BUCKET.get(key);
              if(!object)throw Error('STAGING_PAGE_MISSING');
              await instance.items.upload(key,await object.text(),{metadata:buildServerDerivedMetadata({documentId:String(d.id),category:String(d.category),visibility:d.visibility as 'public'|'program'|'admin',revision:String(d.ai_search_revision),active:true})});
            }
          }
        }
        return json(result);
      }
      if(url.pathname.startsWith('/api/private/v1/ai-document-source/'))return json(await handleAiDocumentSource(request,url.pathname.split('/').pop()!,shared));
      if(url.pathname.startsWith('/api/private/v1/ai-document-file/'))return handleAiDocumentFile(request,url.pathname.split('/').pop()!,shared);
      if(url.pathname==='/api/private/v1/ai-advisor'){
        // Structural diagnostics for the isolated acceptance run only. Never
        // return request identity, raw provider payloads, tokens or passages.
        let searchCalls=0,generatorCalls=0,pageReads=0,retrievalDurationMs=0,generatorDurationMs=0;
        let resultClass:string|null=null;
        const advisor:AiAdvisorEnv={...shared,AI:env.AI as unknown as AiAdvisorEnv['AI'],AI_ADVISOR_V2_MODE:'on',AI_ADVISOR_V2_CANARY_PERCENT:'0',
          advisorTelemetry:{record:e=>{resultClass=e.abstentionReason||(e.abstained?'SAFE_ABSTENTION':e.zeroAiUsed?'ZERO_AI':'SUPPORTED_VALID_CITATIONS');}},
          advisorV2AiSearchClient:{search:async(_name,r)=>{searchCalls++;const t=Date.now();try{return await instance.search(r as AiSearchSearchRequest);}finally{retrievalDurationMs+=Date.now()-t;}}},
          advisorV2AiSearchInstances:{text:INSTANCE,ocr:INSTANCE},AI_ADVISOR_RETRIEVAL_COMPLETENESS_ENABLED:'true',
          advisorCompletenessTelemetry:{pageRead:()=>{pageReads++;}}};
        advisor.AI={run:async(model,input)=>{generatorCalls++;const t=Date.now();try{return await (env.AI as unknown as NonNullable<AiAdvisorEnv['AI']>).run(model,input);}finally{generatorDurationMs+=Date.now()-t;}}};
        const result=await handleAiAdvisor(request,url,advisor,ctx);
        return json({...result,stagingMetrics:{searchCalls,generatorCalls,pageReads,retrievalDurationMs,generatorDurationMs,resultClass}});
      }
      if(url.pathname.startsWith('/api/'))return json({error:'Not found'},404);
      return env.ASSETS.fetch(request);
    }catch(e){const status=aiAdvisorErrorStatus(e);return json({error:'Yêu cầu staging chưa hoàn tất.',code:'STAGING_REQUEST_FAILED'},status===500&&typeof(e as {status?:number})?.status==='number'?(e as {status:number}).status:status);}
  },
};
