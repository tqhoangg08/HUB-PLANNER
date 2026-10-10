// One-document rehearsal, ONLY the existing isolated app. Never promotes D1.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
const emit=v=>console.log(JSON.stringify(v));
try{
  const s=JSON.parse(readFileSync('.cache/advisor-app-staging/private-state.json'));
  if(s.name!=='hub-advisor-pr88-app-staging'||!/^https:\/\/hub-advisor-pr88-app-staging\.[a-z0-9-]+\.workers\.dev$/.test(s.origin))throw Error('ISOLATION_REQUIRED');
  const at=process.argv.indexOf('--prepared');if(at<0)throw Error('PRIVATE_PREPARED_ARTIFACT_REQUIRED');
  const path=resolve(process.argv[at+1]),rel=relative(process.cwd(),path);if(!rel.startsWith('..')&&!isAbsolute(rel))throw Error('OUTSIDE_GIT_REQUIRED');
  const prepared=JSON.parse(readFileSync(path));
  const login=await fetch(`${s.origin}/api/auth/sign-in/email`,{method:'POST',headers:{Origin:s.origin,'Content-Type':'application/json'},body:JSON.stringify({email:s.email,password:s.password}),signal:AbortSignal.timeout(30000)});
  if(!login.ok)throw Error('SYNTHETIC_LOGIN_FAILED');
  const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const list=await fetch(`${s.origin}/api/admin/v1/ai-documents`,{headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)}).then(r=>r.json());
  const d=(list.documents||[]).find(d=>d.content_hash===prepared.sourceContentHash);if(!d)throw Error('STAGING_DOCUMENT_MISSING');
  const current=await fetch(`${s.origin}/api/admin/v1/ai-documents?id=${encodeURIComponent(d.id)}`,{headers:{Cookie:cookie},signal:AbortSignal.timeout(30000)}).then(r=>r.json());
  if(current.document?.ai_search_status!=='completed')throw Error('ALL_PAGES_NOT_READY');
  const r=await fetch(`${s.origin}/api/staging/reprocess`,{method:'POST',headers:{Origin:s.origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({sourceHash:prepared.sourceContentHash,prepared}),signal:AbortSignal.timeout(120000)});
  const result=await r.json();if(!r.ok||result.originalPreserved!==true||result.oldRevisionPreserved!==true||result.d1PointerChanged!==false)throw Error('REPROCESS_REHEARSAL_NOT_PROVEN');
  writeFileSync(resolve('.cache/advisor-app-staging/reprocess-private.json'),JSON.stringify({documentId:d.id,...result}));
  emit({phase:'staging_reprocess',httpStatus:r.status,pages:result.pages,originalPreserved:result.originalPreserved,oldRevisionPreserved:result.oldRevisionPreserved,d1PointerChanged:result.d1PointerChanged,allNewPagesReady:result.allPagesReady,productionWrites:0});
}catch(e){emit({phase:'staging_reprocess',result:'BLOCKED',safeError:/^[A-Z_]+$/.test(e.message)?e.message:e.name,productionWrites:0});process.exitCode=1;}
