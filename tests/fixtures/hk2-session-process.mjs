import {PublicationSessionState} from '../../scripts/hk2-2026-2027/publication-session-state.mjs';
const state=new PublicationSessionState(process.argv[2]);await state.start();
await state.update('AWAITING_OWNER',{native_active:false,expires_at:new Date(Date.now()+60000).toISOString()});
process.send({ready:true});
process.on('message',m=>{if(m.exit)process.exit(27);});
