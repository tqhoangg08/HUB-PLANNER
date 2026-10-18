import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,openSync,closeSync,unlinkSync,existsSync,renameSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';
import ts from 'typescript';
import {prepare,approve,REPO,ENV,WORKFLOW,VALIDATION,fail,runUrl,validateCI,validateOwner,validateActive,
  validateBaselineEvidence,baselinePatch,policyDigest,contextFor,validateReceipt} from './release-assistant-core.mjs';
import {githubAPI,ownerToken,snapshot,completeList,safeError} from './release-assistant-api.mjs';
import {validateDispatchContext} from './check-public-release-approval.mjs';
import {checkPublicReleaseState,PUBLIC_RELEASE_ACCOUNT,PUBLIC_RELEASE_PREDEPLOY_VERSION} from './check-public-release-state.mjs';

const pause=ms=>new Promise(r=>setTimeout(r,ms));
export function git(args,options={}) {
  try {return execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,...options}).trim();}
  catch {fail('GIT_OPERATION_FAILED');}
}
export function verifyTarget() {
  const remote=git(['remote','get-url','origin']);
  if(![`https://github.com/${REPO}.git`,`https://github.com/${REPO}`,`git@github.com:${REPO}.git`].includes(remote)) fail('REPOSITORY_REQUIRED');
  if(git(['status','--porcelain','--untracked-files=all'])) fail('CLEAN_WORKTREE_REQUIRED');
  git(['fetch','origin','main']);
  if(git(['rev-parse','HEAD'])!==git(['rev-parse','origin/main'])) fail('CHECKOUT_EXACT_ORIGIN_MAIN_REQUIRED');
}
export function stateStore() {
  const dir=resolve(git(['rev-parse','--git-common-dir']),'hub-release-assistant');
  mkdirSync(dir,{recursive:true});
  const path=resolve(dir,'receipt.json'),lock=resolve(dir,'lock');
  return {dir,load:async()=>existsSync(path)?JSON.parse(readFileSync(path,'utf8')):undefined,
    archive:async r=>{renameSync(path,resolve(dir,`completed-${r.runId}-${Date.now()}.json`));},
    save:async value=>{writeFileSync(`${path}.tmp`,JSON.stringify(value,null,2),{mode:0o600});renameSync(`${path}.tmp`,path);},
    lock:()=>{let fd;try{fd=openSync(lock,'wx',0o600);writeFileSync(fd,`${process.pid}\n`);}catch{fail('LOCAL_RELEASE_LOCK_EXISTS_REVIEW_BEFORE_REMOVING');}
      return ()=>{closeSync(fd);unlinkSync(lock);};}};
}
export async function confirm(phrase,description) {
  if(!process.stdin.isTTY||!process.stdout.isTTY) fail('INTERACTIVE_OWNER_CONFIRMATION_REQUIRED');
  const rl=createInterface({input:process.stdin,output:process.stdout});
  try {return await rl.question(`${description}\nType exactly: ${phrase}\n> `)===phrase;} finally {rl.close();}
}
function readConfig() {
  const parsed=ts.parseConfigFileTextToJson('cloudflare/wrangler.jsonc',readFileSync('cloudflare/wrangler.jsonc','utf8'));
  if(parsed.error) fail('CONFIG_PARSE_FAILED'); return parsed.config;
}
export function createIO(api,store) {
  const config=readConfig();
  const io={...store,now:()=>Date.now(),print:console.log,confirm,target:async()=>verifyTarget(),snapshot:id=>snapshot(api,id),
    production:phase=>checkPublicReleaseState(config,{phase,account:PUBLIC_RELEASE_ACCOUNT,
      token:process.env.CLOUDFLARE_API_TOKEN,beforeVersion:phase==='postdeploy'?PUBLIC_RELEASE_PREDEPLOY_VERSION:undefined}),
    summary:(s,run)=>console.log(`PUBLIC ONLY | Owner=${s.user.login} (${s.user.id})\nSHA=${s.branch.commit.sha}\nCommit=${JSON.stringify(git(['show','-s','--format=%s',s.branch.commit.sha]))}\nChanges=https://github.com/${REPO}/compare/${s.previousRelease.sha}...${s.branch.commit.sha}\nCI=${runUrl(validateCI(s))}\nWorker=${config.name}\nVersion=${s.live.versionId}; traffic=100%; bindings/schema/ledger=PASS\nEnvironment=${ENV}; policy=${policyDigest(s)}\n${run?`Run=${runUrl(run.id)}\n`:''}Auth Worker isolated; no migrations/backfill.`),
    dispatchValidation:async sha=>{
      if((await api('/branches/main')).commit.sha!==sha) fail('MAIN_CHANGED');
      await api(`/actions/workflows/${VALIDATION.split('/').at(-1)}/dispatches`,{method:'POST',body:{ref:'main'}});
    },
    waitApproval:async receipt=>{
      console.log('Waiting for the existing environment timer before confirmation 2/2 (up to 45 minutes).');
      for(let i=0;i<135;i++) {
        await pause(20000);const s=await snapshot(api,receipt.runId);s.live=await io.production('predeploy');
        try {validateReceipt(s,receipt,Date.now());return;}catch(e){if(e.message!=='APPROVAL_TOO_EARLY')throw e;}
        if(i%3===0)console.log(`Release ${receipt.runId}: minimum approval time has not elapsed.`);
      } fail('APPROVAL_WAIT_TIMEOUT');
    },
    dispatchRelease:async sha=>{
      if((await api('/branches/main')).commit.sha!==sha) fail('MAIN_CHANGED');
      await api(`/actions/workflows/${WORKFLOW.split('/').at(-1)}/dispatches`,{method:'POST',body:{ref:'main',inputs:{approve_public_release:true,approved_sha:sha}}});
    },
    waitCI:async sha=>{
      console.log('Waiting for exact-main independent CI (up to 45 minutes). Ctrl+C stops local waiting.');
      for(let i=0;i<270;i++) {
        await pause(10000); const s=await snapshot(api); if(s.branch.commit.sha!==sha) fail('MAIN_CHANGED');
        try {validateCI(s);return s;}catch(e){if(e.message!=='EXACT_SHA_CI_REQUIRED')throw e;}
        if(i%6===0) console.log('Independent validation has not passed yet.');
      } fail('CI_WAIT_TIMEOUT');
    },
    findDispatched:async receipt=>{
      for(let i=0;i<12;i++) {
        const s=await snapshot(api);
        if(s.branch.commit.sha!==receipt.sha||policyDigest(s)!==receipt.policy) fail('DISPATCH_CONTEXT_CHANGED_CHECK_GITHUB_RUNS');
        const candidates=s.runs.filter(r=>!receipt.previousRuns.includes(String(r.id))&&Date.parse(r.created_at)>=Date.parse(receipt.requestedAt));
        if(candidates.length>1) fail('DISPATCH_RUN_AMBIGUOUS');
        if(candidates.length===1) {validateActive(s.runs,String(candidates[0].id));return candidates[0];}
        await pause(5000);
      } fail('DISPATCH_RUN_UNKNOWN_DO_NOT_RETRY');
    },
    updateVariable:(name,value)=>api(`/environments/${ENV}/variables/${name}`,{method:'PATCH',body:{name,value}}),
    monitor:async receipt=>{
      for(let i=0;i<360;i++) {
        const run=await api(`/actions/runs/${receipt.runId}`);
        const s=await snapshot(api); validateDispatchContext(contextFor(s,run));
        if(policyDigest(s)!==receipt.policy) fail('PROTECTION_CHANGED');
        if(run.status==='completed') {
          console.log(`RELEASE_RUN=${runUrl(run.id)}; RESULT=${run.conclusion}`);
          if(run.conclusion!=='success') fail('RELEASE_FAILED_OWNER_REVIEW_REQUIRED');
          const live=await io.production('postdeploy'); await io.provenance(live.versionId,receipt.runId);
          receipt.state='completed';receipt.deployedVersion=live.versionId;await store.save(receipt);
          console.log(`PUBLIC_URL=https://hub-planner-public-dev-api.tqhoangg2.workers.dev\nPOSTFLIGHT=PASS; VERSION=${live.versionId}\nRun npm run release:baseline to prepare the reviewed pin update.`);
          return receipt;
        }
        if(i%6===0) console.log(`Release ${receipt.runId}: ${run.status}`);
        await pause(10000);
      } fail('RELEASE_WAIT_TIMEOUT_USE_RELEASE_STATUS');
    },
    provenance:async (expectedVersion,runId,pendingRunId)=>{
      const s=await snapshot(api); validateOwner(s);
      if(!runId) validateActive(s.runs.filter(r=>String(r.id)!==pendingRunId));
      // Only the newest successful release is a candidate; never silently search older runs for a matching version.
      const run=s.runs.filter(r=>r.status==='completed'&&r.conclusion==='success').sort((a,b)=>b.id-a.id)[0];
      if(!run||runId&&String(run.id)!==runId) fail('LATEST_SUCCESSFUL_RELEASE_REQUIRED');
      git(['merge-base','--is-ancestor',run.head_sha,'origin/main']);
      const jobs=await completeList(api,`/actions/runs/${run.id}/jobs?per_page=100`,'jobs');
      const candidates=jobs.filter(j=>j.name==='release-public');
      if(candidates.length!==1) fail('RELEASE_JOB_UNVERIFIED');
      const job=candidates[0]; const logs=await api(`/actions/jobs/${job.id}/logs`,{logs:true});
      const base=`https://api.cloudflare.com/client/v4/accounts/${PUBLIC_RELEASE_ACCOUNT}/workers/scripts/${config.name}`;
      const cf=async path=>{
        if(!process.env.CLOUDFLARE_API_TOKEN||/[\r\n]/.test(process.env.CLOUDFLARE_API_TOKEN)) fail('PUBLIC_SCOPED_CREDENTIAL_REQUIRED');
        let r,j;try{r=await fetch(`${base}/${path}`,{redirect:'error',headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`},signal:AbortSignal.timeout(15000)});
          j=await r.json();}catch{fail('CLOUDFLARE_PROVENANCE_UNAVAILABLE');}
        if(!r.ok||j.success!==true||!j.result) fail('CLOUDFLARE_PROVENANCE_UNVERIFIED'); return j.result;
      };
      const deployments=await cf('deployments');
      if(!Array.isArray(deployments.deployments)||!deployments.deployments.length||deployments.deployments.some(d=>!Number.isFinite(Date.parse(d.created_on)))) fail('DEPLOYMENT_PROVENANCE_REQUIRED');
      const deployment=deployments.deployments.sort((a,b)=>Date.parse(b.created_on)-Date.parse(a.created_on))[0];
      const versionId=deployment.versions?.[0]?.version_id;
      if(!/^[a-f0-9-]{36}$/.test(versionId||'')||versionId!==expectedVersion) fail('WORKER_VERSION_DRIFT');
      const version=await cf(`versions/${versionId}`);
      validateBaselineEvidence({s:{...s,runs:s.runs.filter(r=>String(r.id)!==pendingRunId)},run,job,logs,version,deployment});
      return {runId:String(run.id),sha:run.head_sha,version:version.id,url:runUrl(run.id),deploymentId:deployment.id};
    }};
  return io;
}
export async function baseline(io,store) {
  await io.target();
  const s=await io.snapshot();validateOwner(s);validateActive(s.runs);
  const live=await io.production('postdeploy');
  const evidence=await io.provenance(live.versionId);
  // A second read prevents producing a patch after production/main/policy changes during evidence collection.
  const fresh=await io.snapshot(); validateOwner(fresh);validateActive(fresh.runs);
  if(fresh.branch.commit.sha!==s.branch.commit.sha||policyDigest(fresh)!==policyDigest(s)||
    (await io.production('postdeploy')).versionId!==live.versionId) fail('BASELINE_EVIDENCE_CHANGED');
  const file='scripts/check-public-release-state.mjs',test='tests/public-release-v2-rollout.test.mjs';
  const patch=baselinePatch(readFileSync(file,'utf8'),readFileSync(test,'utf8'),live.versionId);
  git(['switch','-c',`codex/release-baseline-${evidence.runId}`]);
  const comment=`// Reviewed release baseline evidence: run ${evidence.runId}, exact SHA ${evidence.sha}.\n// See docs/public-release-baseline-evidence.json; 100% serving version verified read-only.`;
  writeFileSync(file,patch.source.replace(/\/\/ (?:Reverified read-only|Reviewed release baseline evidence:)[^\n]*\r?\n\/\/[^\n]*/,comment));
  writeFileSync(test,patch.testSource);
  writeFileSync('docs/public-release-baseline-evidence.json',JSON.stringify({...evidence,previousVersion:patch.old,verifiedAt:new Date().toISOString()},null,2)+'\n');
  writeFileSync(resolve(store.dir,'baseline-pr.md'),`Update the reviewed Public predeploy pin from ${patch.old} to ${live.versionId}.\n\nEvidence: ${evidence.url}, exact SHA ${evidence.sha}, deployment ${evidence.deploymentId}. Serving traffic is one version at 100%; postflight log, Owner provenance, bindings and schema/ledger were verified read-only.\n\nRun all required tests before commit/push/PR. Owner review and protected merge remain required.\n`);
  io.print(`BASELINE_BRANCH=codex/release-baseline-${evidence.runId}\nPrepared pin, regression assertion, evidence and PR body (${resolve(store.dir,'baseline-pr.md')}). Run tests, review git diff, commit, push and open a PR. No production state changed.`);
}
export async function main(args=process.argv.slice(2)) {
  if(args[0]==='--help'||args.length===0) {
    console.log('HUB Release Assistant: prepare | approve [--manual] | status | baseline\nUse a clean checkout of freshly fetched origin/main. Node 22+, Git, Owner GH_TOKEN or authenticated gh, and scoped read-only CLOUDFLARE_API_TOKEN. No --yes or token arguments.');return;
  }
  const [command,...flags]=args;
  if(!['prepare','approve','status','baseline'].includes(command)||flags.length>1||flags.length===1&&!(command==='approve'&&flags[0]==='--manual')) fail('UNSUPPORTED_RELEASE_ARGUMENT');
  if(process.env.GITHUB_ACTIONS==='true') fail('LOCAL_OWNER_TERMINAL_ONLY');
  const store=stateStore();const unlock=store.lock();
  try {
    const api=githubAPI(ownerToken());const io=createIO(api,store);
    if(command==='prepare'&&await prepare(io)==='DECLINED') console.log('OWNER_DECLINED; NO_RELEASE_DISPATCH');
    if(command==='approve'&&await approve(io,{manual:flags.includes('--manual')})==='DECLINED') console.log('OWNER_DECLINED; NO_APPROVAL_WRITES');
    if(command==='baseline') await baseline(io,store);
    if(command==='status') {
      const receipt=await store.load();if(!receipt?.runId) fail('NO_IDENTIFIED_RELEASE_CHECK_GITHUB_ACTIONS');
      const run=await api(`/actions/runs/${receipt.runId}`);
      console.log(`RELEASE_RUN=${runUrl(run.id)}; STATUS=${run.status}; RESULT=${run.conclusion||'pending'}; LOCAL_STATE=${receipt.state}`);
      if(['approved','manual'].includes(receipt.state)) await io.monitor(receipt);
    }
  } finally {unlock();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(e=>{
  console.error(`RELEASE_ASSISTANT=BLOCKED; REASON=${safeError(e)}`);process.exitCode=1;
});
