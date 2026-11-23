/** SDK isolation. No transport survives the owner-approval wait; no automatic restart. */
import { fork } from 'node:child_process';
const defaultWorker = new URL('./publication-native-worker.mjs', import.meta.url);
export const NATIVE_LEASE_MS = 60000;

export class PublicationNativeLease {
  #child; #closed = false; #failure; #sequence = 0; #pending = new Map(); #leaseTimer; #exitPromise;
  diagnostics = []; mutationAttempted = false;
  constructor({ publication = false, worker = defaultWorker, requestMs = 40000, leaseMs = NATIVE_LEASE_MS, signal, expiresAt } = {}) {
    this.options = { publication, worker, requestMs, leaseMs, signal, expiresAt };
    const descriptors = new WeakMap();
    const prepare = (sql, params = []) => {
      const descriptor = { sql, params };
      const statement = { bind: (...values) => prepare(sql,values),
        all: () => this.#request('all',[descriptor]), first: (...firstArgs) => this.#request('first',[descriptor],firstArgs) };
      descriptors.set(statement,descriptor); return statement;
    };
    this.db = { prepare, batch: list => {
      const statements = list.map(s => descriptors.get(s));
      if (!statements.length || statements.some(s => !s)) return Promise.reject(Error('FOREIGN_NATIVE_STATEMENT'));
      return this.#request('batch',statements);
    } };
  }
  get active() { return !!this.#child && !this.#closed && !this.#failure; }
  get pid() { return this.#child?.pid || null; }
  #fail(error) {
    if (!this.#failure) this.#failure = error;
    clearTimeout(this.#leaseTimer);
    for (const p of this.#pending.values()) { clearTimeout(p.timer); p.reject(this.#failure); }
    this.#pending.clear();
  }
  #start() {
    const env={...process.env,WRANGLER_LOG:'error',WRANGLER_SEND_METRICS:'false'};
    delete env.GH_TOKEN;delete env.GITHUB_TOKEN;
    const child = this.#child = fork(this.options.worker,[this.options.publication ? 'publication' : 'read-only'],{
      serialization:'advanced',stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,
      env,
    });
    this.#exitPromise = new Promise(resolve => child.once('exit',(code,signal) => {
      if (!this.#closed) this.#fail(Error(`NATIVE_CHILD_EXIT code=${code} signal=${signal}; reconcile before another attempt`));
      resolve({code,signal});
    }));
    const diagnostic = chunk => {
      const matches = chunk.toString().match(/internal error; reference\s*=\s*[a-z0-9]+|Network connection lost\.?|ERR_[A-Z_]+/g) || [];
      this.diagnostics.push(...matches); this.diagnostics = this.diagnostics.slice(-20);
    };
    child.stdout.on('data',diagnostic); child.stderr.on('data',diagnostic);
    child.on('error',() => this.#fail(Error('NATIVE_CHILD_PROCESS_ERROR')));
    child.on('message',message => {
      if (message.closed !== undefined) { const p = this.#pending.get('close'); this.#pending.delete('close'); if(p){clearTimeout(p.timer);message.closed?p.resolve():p.reject(Error('NATIVE_DISPOSE_FAILED'));} return; }
      const p = this.#pending.get(message.id); if (!p) return;
      this.#pending.delete(message.id); clearTimeout(p.timer);
      if (message.error) { const error = Error(message.error); p.reject(error); this.#fail(error); }
      else p.resolve(message.result);
    });
    this.#leaseTimer = setTimeout(() => { this.#fail(Error('NATIVE_LEASE_EXPIRED')); child.kill(); },this.options.leaseMs);
  }
  async #request(kind,statements,firstArgs) {
    if(this.options.signal?.aborted)throw this.options.signal.reason || Error('OPERATOR_ABORTED');
    if (this.#closed || this.#failure) throw this.#failure || Error('NATIVE_LEASE_CLOSED');
    if (statements.some(s => !/^\s*(?:SELECT\b|PRAGMA table_info\()/i.test(s.sql))) {
      if (!this.options.publication || this.mutationAttempted) throw Error('NATIVE_PUBLICATION_SCOPE_REQUIRED');
      if(!(Date.parse(this.options.expiresAt)>Date.now()))throw Error('NATIVE_PUBLICATION_APPROVAL_EXPIRED');
      this.mutationAttempted = true;
    }
    if (!this.#child) this.#start();
    const id = ++this.#sequence;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(() => { this.#fail(Error('NATIVE_REQUEST_TIMEOUT; outcome may be uncertain; no retry')); this.#child.kill(); },this.options.requestMs);
      this.#pending.set(id,{resolve,reject,timer});
      this.#child.send({id,kind,statements,firstArgs,expiresAt:this.options.expiresAt},error => { if(error)this.#fail(Error('NATIVE_IPC_DISCONNECTED')); });
    });
  }
  async health() {
    const result = await this.db.prepare('SELECT 1 AS publication_connection_health').all();
    if (result.success !== true || result.results?.[0]?.publication_connection_health !== 1
      || result.meta?.rows_written !== 0 || result.meta?.changed_db !== false || result.meta?.served_by_primary !== true) throw Error('NATIVE_HEALTH_NOT_PRIMARY_READ_ONLY');
    return true;
  }
  async close() {
    if (this.#closed) return;
    this.#closed = true; clearTimeout(this.#leaseTimer);
    if (!this.#child) return;
    const child = this.#child;
    if (child.exitCode !== null || child.signalCode !== null || !child.connected) { child.kill(); if(this.#failure)throw this.#failure; return; }
    try {
      await new Promise((resolve,reject) => {
        const timer = setTimeout(() => { this.#pending.delete('close'); reject(Error('NATIVE_DISPOSE_TIMEOUT')); },10000);
        this.#pending.set('close',{resolve,reject,timer});
        child.send({kind:'close'},error => { if(error){clearTimeout(timer);this.#pending.delete('close');reject(Error('NATIVE_IPC_DISCONNECTED'));} });
      });
      const exit = await Promise.race([this.#exitPromise,new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('NATIVE_EXIT_TIMEOUT')),5000);t.unref();})]);
      if(exit.code !== 0)throw Error('NATIVE_DISPOSE_CHILD_EXIT');
    } finally { child.kill(); }
    if(this.#failure)throw this.#failure;
  }
}
