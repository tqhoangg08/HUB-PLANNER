import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';

// Run the LOCKED real CLI against an in-process fake Cloudflare API only.
// This proves the upload protocol, not real Cloudflare permission or live success.
test('locked Wrangler --keep-vars sends explicit 100 percent plus retention metadata, without remote deployment',async()=>{
  const cli=resolve('node_modules/wrangler/bin/wrangler.js');
  const dir=await mkdtemp(join(tmpdir(),'hub-wrangler-retention-'));
  let metadata;const requests=[],unexpected=[];
  const server=createServer(async(req,res)=>{
    try{
      const path=req.url;requests.push(`${req.method} ${path}`);
      let result;
      if(req.method==='POST'&&path==='/accounts/'+ 'a'.repeat(32)+'/workers/scripts/offline-retention-fixture/versions?bindings_inherit=strict'){
        const parts=[];for await(const part of req)parts.push(part);
        const form=await new Response(Buffer.concat(parts),{headers:{'Content-Type':req.headers['content-type']}}).formData();
        metadata=JSON.parse(String(form.get('metadata')));
        result={id:'11111111-1111-4111-8111-111111111111',number:1,metadata:{created_on:'2026-10-12T00:00:00Z'},resources:{script:{handlers:['fetch']},script_runtime:{startup_time_ms:1},bindings:metadata.bindings}};
      }else if(req.method==='GET'&&path.endsWith('/secrets'))result=[];
      else if(req.method==='GET'&&path.endsWith('/deployments'))result={deployments:[]};
      else if(req.method==='GET'&&path.endsWith('/settings')){
        result={bindings:[{name:'AI_ADVISOR_V2_CANARY_PERCENT',type:'plain_text',text:'7'},{name:'DASHBOARD_ONLY',type:'plain_text',text:'retain-fixture'}]};
      }else if(req.method==='GET'&&path.endsWith('/workers/subdomain'))result={subdomain:'offline'};
      else if(req.method==='GET'&&path.endsWith('/subdomain'))result={enabled:false,previews_enabled:false};
      else if(req.method==='GET'&&path.includes('/workers/services/'))result={default_environment:{script:{last_deployed_from:'wrangler',compatibility_date:'2026-07-29'}},environments:[]};
      else if(req.method==='POST'&&path.endsWith('/deployments'))result={id:'offline-deployment',versions:[{version_id:'11111111-1111-4111-8111-111111111111',percentage:100}]};
      else if(req.method==='POST'&&path.endsWith('/subdomain'))result={enabled:false};
      else if(req.method==='PATCH'&&path.endsWith('/script-settings'))result={};
      else{unexpected.push(`${req.method} ${path}`);res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,errors:[{code:10000,message:'Offline mock denies unknown endpoint'}]}));return;}
      res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({success:true,result,errors:[],messages:[]}));
    }catch{res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({success:false,errors:[{code:10000,message:'Offline mock parse failure'}]}));}
  });
  try{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const port=server.address().port;
    await writeFile(join(dir,'index.js'),'export default {fetch(){return new Response("offline");}};');
    await writeFile(join(dir,'wrangler.jsonc'),JSON.stringify({name:'offline-retention-fixture',main:'index.js',compatibility_date:'2026-07-29',workers_dev:false,preview_urls:false,send_metrics:false,vars:{AI_ADVISOR_V2_MODE:'canary',AI_ADVISOR_V2_CANARY_PERCENT:'100'}}));
    const result=await new Promise((resolveResult,reject)=>{
      const child=spawn(process.execPath,[cli,'deploy','--config','wrangler.jsonc','--keep-vars'],{cwd:dir,env:{
        PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:dir,TMP:dir,
        CLOUDFLARE_API_TOKEN:'offline-fixture-not-a-real-token',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
        CLOUDFLARE_API_BASE_URL:`http://127.0.0.1:${port}`,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:join(dir,'wrangler.log'),CI:'true',NO_COLOR:'1',
      }});
      let output='';child.stdout.on('data',b=>{output+=String(b);});child.stderr.on('data',b=>{output+=String(b);});
      const timer=setTimeout(()=>child.kill(),30000);
      child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);resolveResult({code,output});});
    });
    assert.equal(result.code,0,`Offline CLI failed; request paths: ${JSON.stringify(requests)}; ${result.output.slice(-1500)}`);
    assert.deepEqual(unexpected,[]);
    assert.ok(requests.some(p=>p.includes('/versions?bindings_inherit=strict')));
    assert.ok(metadata.keep_bindings.includes('plain_text'));assert.ok(metadata.keep_bindings.includes('json'));
    assert.equal(metadata.bindings.find(b=>b.name==='AI_ADVISOR_V2_CANARY_PERCENT').text,'100');
    assert.equal(metadata.bindings.find(b=>b.name==='AI_ADVISOR_V2_MODE').text,'canary');
    // Unspecified dashboard vars are retained by keep_bindings, not copied as credentials.
    assert.ok(!metadata.bindings.some(b=>b.name==='DASHBOARD_ONLY'));
  }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
