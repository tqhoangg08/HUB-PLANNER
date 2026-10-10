// No provider calls or apply flag. The manifest and plan must stay outside Git.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {buildDocumentReprocessPlan} from '../shared/ai-document-reprocess.ts';
const outside=p=>{const r=relative(process.cwd(),p);if(!r.startsWith('..')&&!isAbsolute(r))throw Error('OUTSIDE_GIT_REQUIRED');};
try{
  if(process.argv.length!==4)throw Error('USAGE_MANIFEST_AND_OUTPUT_ONLY');
  const input=resolve(process.argv[2]),output=resolve(process.argv[3]);outside(input);outside(output);
  const plan=buildDocumentReprocessPlan(JSON.parse(readFileSync(input,'utf8')));
  writeFileSync(output,JSON.stringify(plan,null,2));console.log(JSON.stringify({mode:'DRY_RUN',documents:plan.length,sourceWrites:0,productionWrites:0,requiresApproval:true}));
}catch{console.log(JSON.stringify({mode:'DRY_RUN',result:'BLOCKED_INVALID_MANIFEST_OR_PATH'}));process.exitCode=1;}
