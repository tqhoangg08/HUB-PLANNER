import {verifyGitHubCIReadAccess,RELEASE_REPOSITORY} from './check-public-release-approval.mjs';
import {readFileSync} from 'node:fs';

try{
  if(process.argv.length!==2||process.env.GITHUB_REPOSITORY!==RELEASE_REPOSITORY)throw Error('CI_PROBE_CONTEXT_REQUIRED');
  const event=process.env.GITHUB_EVENT_NAME;
  // PR check runs attach to the source SHA, while checkout/GITHUB_SHA can be
  // GitHub's synthetic merge SHA. This probe is never the main release gate.
  const sha=event==='pull_request'?JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')).pull_request?.head?.sha:process.env.GITHUB_SHA;
  await verifyGitHubCIReadAccess({sha,runId:process.env.GITHUB_RUN_ID,event},
    {ciToken:process.env.GH_TOKEN});
  console.log('GITHUB_ACTIONS_CI_READ_ACCESS=PASS; NOT_RELEASE_APPROVAL');
}catch(e){
  console.error(`GITHUB_ACTIONS_CI_READ_ACCESS=BLOCKED; ${/^[A-Z_0-9]+$/.test(e.message)?e.message:'METADATA_UNVERIFIED'}`);
  process.exitCode=1;
}
