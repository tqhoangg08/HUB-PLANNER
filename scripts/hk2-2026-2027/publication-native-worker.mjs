/** Private IPC child, never a server. Exactly one native mutation batch per lease. */
import { pathToFileURL } from 'node:url';
import { openProductionBinding } from './production-transport.mjs';

const readOnly = sql => typeof sql === 'string' && /^\s*(?:SELECT\b|PRAGMA table_info\()/i.test(sql);
export function nativeRequestHandler(raw, publication = false) {
  let mutationAttempted = false;
  return async message => {
    const list = message.statements;
    if (!Array.isArray(list) || !list.length || !list.every(s => typeof s.sql === 'string' && Array.isArray(s.params))) throw Error('INVALID_NATIVE_REQUEST');
    const reads = list.every(s => readOnly(s.sql));
    if (!reads) {
      if (!publication || mutationAttempted || message.kind !== 'batch' || list.length !== 2
        || !/^INSERT INTO hk2_catalogue_publication_receipts\(/.test(list[0].sql)
        || !/^UPDATE hk2_catalogue_publications SET state='OPEN',revision=1,/.test(list[1].sql)) throw Error('NATIVE_PUBLICATION_SCOPE_REQUIRED');
      if(!(Date.parse(message.expiresAt)>Date.now()))throw Error('NATIVE_PUBLICATION_APPROVAL_EXPIRED');
      mutationAttempted = true; // consume before sending; never retry an uncertain write
    }
    const prepared = list.map(s => s.params.length ? raw.prepare(s.sql).bind(...s.params) : raw.prepare(s.sql));
    if (message.kind === 'batch') return raw.batch(prepared);
    if (!reads || prepared.length !== 1) throw Error('READ_ONLY_NATIVE_METHOD_REQUIRED');
    if (message.kind === 'all') return prepared[0].all();
    if (message.kind === 'first') return prepared[0].first(...(message.firstArgs || []));
    throw Error('UNKNOWN_NATIVE_METHOD');
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let proxy, handle;
  const send = message => { if (process.connected) process.send(message); };
  process.on('message', async message => {
    if (message.kind === 'close') {
      try { if (proxy) await proxy.dispose(); proxy = null; send({ closed: true }); process.exitCode = 0; }
      catch { send({ closed: false }); process.exitCode = 1; }
      finally { process.disconnect(); }
      return;
    }
    try {
      if (!handle) { proxy = await openProductionBinding(); handle = nativeRequestHandler(proxy.env.DB, process.argv[2] === 'publication'); }
      send({ id: message.id, result: await handle(message) });
    } catch (error) {
      // No request headers, cookies, preview URLs or credentials cross the IPC boundary.
      const messageText = String(error.message).replace(/https?:\/\/\S+/g, '[URL]').replace(/Bearer\s+\S+/gi, '[REDACTED]').slice(0,800);
      send({ id: message.id, error: messageText });
    }
  });
  process.on('disconnect', () => { void (async()=>{try{await proxy?.dispose();}catch{}finally{process.exit(process.exitCode || 0);}})(); });
}
