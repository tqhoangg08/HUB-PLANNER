/** Durable liveness only, never publication authority. Does not recover/remove locks. */
import { readFile, appendFile, unlink } from 'node:fs/promises';
import { writeFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export async function releaseOwnedOperatorLock(filename,pid,nonce) {
  try {
    const lock=JSON.parse(await readFile(filename,'utf8'));
    if(lock.pid!==pid||lock.nonce!==nonce)return false;
    await unlink(filename);return true;
  }catch(e){if(e.code==='ENOENT')return false;throw e;}
}

export function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  try {
    if (process.platform === 'win32') {
      const value = execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',
        `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],timeout:5000}).trim();
      return String(Date.parse(value));
    }
    // Linux PID + boot + kernel start ticks protect against PID reuse/reboots.
    const text = execFileSync('cat',[`/proc/${pid}/stat`],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
    const boot = execFileSync('cat',['/proc/sys/kernel/random/boot_id'],{encoding:'utf8'}).trim();
    return `${boot}:${text.slice(text.lastIndexOf(')')+2).split(' ')[19]}`;
  } catch { return null; }
}

export async function inspectSession(out, { now = Date.now(), probe = processIdentity } = {}) {
  let state;
  try {
    const text=await readFile(path.join(out,'session-state.jsonl'),'utf8');
    if(!text.endsWith('\n'))throw Error('Incomplete heartbeat record');
    state=JSON.parse(text.trimEnd().split('\n').at(-1));
  }
  catch { return {state:'UNTRACKED_OR_MISSING',approval_valid:false,reason:'Do not post legacy/untracked approval files or remove an active operator lock'}; }
  const alive = state.process_identity !== null && probe(state.pid) === state.process_identity;
  const fresh = now-Date.parse(state.heartbeat_at) >= -1000 && now-Date.parse(state.heartbeat_at) <= 15000;
  const approval_valid = alive && fresh && state.stage === 'AWAITING_OWNER'
    && state.native_active === false && Date.parse(state.expires_at) > now;
  return {...state,alive,heartbeat_fresh:fresh,approval_valid,
    diagnosis:alive ? (fresh ? 'LIVE' : 'STALE_HEARTBEAT_DO_NOT_APPROVE') : 'PROCESS_DEAD_RECONCILE_BEFORE_RESTART'};
}

export class PublicationSessionState {
  #timer; #queue = Promise.resolve(); #finished = false; #exit; #signal;
  controller = new AbortController();
  constructor(out) {
    this.out = out;
    this.value = {session_id:randomUUID(),pid:process.pid,process_identity:processIdentity(process.pid),
      started_at:new Date().toISOString(),heartbeat_at:new Date().toISOString(),stage:'PREPARING',native_active:false,approval_valid:false};
    if (!this.value.process_identity) throw Error('OPERATOR_PROCESS_IDENTITY_UNAVAILABLE');
    this.#exit = code => {
      if(this.#finished)return;
      const failure={stage:'ABNORMAL_EXIT',at:new Date().toISOString(),exit_code:code,publication_outcome:this.value.stage==='OPEN_IN_FLIGHT'?'UNCERTAIN_RECONCILE':'NOT_CONFIRMED',automatic_write_retries:0};
      try { writeFileSync(path.join(this.out,'stop.json'),JSON.stringify(failure,null,2),{flag:'wx'}); }catch{}
      try { writeFileSync(path.join(this.out,'abnormal-stop.json'),JSON.stringify(failure,null,2));
        appendFileSync(path.join(this.out,'session-state.jsonl'),JSON.stringify({...this.value,stage:'ABNORMAL_EXIT',approval_valid:false})+'\n'); }catch{}
    };
    this.#signal = signal => this.controller.abort(Error(`Operator interrupted: ${signal}`));
    process.on('exit',this.#exit);process.on('SIGINT',this.#signal);process.on('SIGTERM',this.#signal);
  }
  async update(stage,extra={}) {
    if(this.#finished)throw Error('SESSION_ALREADY_TERMINAL');
    this.value={...this.value,...extra,stage,heartbeat_at:new Date().toISOString(),approval_valid:stage==='AWAITING_OWNER'};
    const copy={...this.value};
    // Append-only avoids Windows rename/EPERM races with status readers/AV.
    // A torn final line is INVALID; never fall back to an older live record.
    this.#queue=this.#queue.then(()=>appendFile(path.join(this.out,'session-state.jsonl'),JSON.stringify(copy)+'\n'));
    await this.#queue;
  }
  async start() {
    await this.update('PREPARING');
    this.#timer=setInterval(()=>{void this.update(this.value.stage).catch(error=>this.controller.abort(error));},3000);
  }
  assertActive() { if(this.controller.signal.aborted)throw this.controller.signal.reason; if(this.#finished)throw Error('SESSION_ALREADY_TERMINAL'); }
  async finish(stage,extra={}) {
    clearInterval(this.#timer);await this.update(stage,{...extra,approval_valid:false});this.#finished=true;
    process.removeListener('exit',this.#exit);process.removeListener('SIGINT',this.#signal);process.removeListener('SIGTERM',this.#signal);
  }
}
