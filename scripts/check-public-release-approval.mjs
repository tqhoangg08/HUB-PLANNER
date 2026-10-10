// Fail closed: merely naming an environment does NOT create approval protection.
import {execFileSync} from 'node:child_process';
export function validateReleaseApproval({sha,head,event,ref,environment,ownerSha,requireOwner}) {
  if(event!=='workflow_dispatch'||ref!=='refs/heads/main'||!/^([a-f0-9]{40})$/.test(sha||'')||sha!==head)throw Error('EXACT_MAIN_APPROVAL_REQUIRED');
  const reviewers=environment?.protection_rules?.find(r=>r.type==='required_reviewers');
  if(!reviewers?.reviewers?.length||reviewers.prevent_self_review!==true||environment.can_admins_bypass!==false)throw Error('PROTECTED_ENVIRONMENT_REQUIRED');
  if(requireOwner&&ownerSha!==sha)throw Error('SEPARATE_OWNER_SHA_APPROVAL_REQUIRED');
  return true;
}
if(process.argv[1]?.endsWith('check-public-release-approval.mjs')) {
  try {
    const r=await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/environments/public-production`,{
      headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,'Accept':'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('PROTECTED_ENVIRONMENT_UNVERIFIED');
    validateReleaseApproval({sha:process.env.APPROVED_SHA,head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
      event:process.env.GITHUB_EVENT_NAME,ref:process.env.GITHUB_REF,environment:await r.json(),ownerSha:process.env.OWNER_APPROVED_SHA,
      requireOwner:process.argv.includes('--require-owner-sha')});
    console.log('PUBLIC_ONLY_APPROVAL_GATE=PASS');
  } catch {console.error('PUBLIC_ONLY_APPROVAL_GATE=BLOCKED');process.exitCode=1;}
}
