import 'dotenv/config';
import {open} from 'node:fs/promises';
const file=process.env.SAFETY_EVENTS_FILE;
if (!file) {console.error('Set SAFETY_EVENTS_FILE to the protected event log path.'); process.exit(1);}
let offset=0, partial='';
async function poll(){
 try {
  const handle=await open(file,'r');
  try {
   const stat=await handle.stat();if(!stat.isFile() || (stat.mode & 0o077)) throw new Error('unsafe file permissions');if(stat.size<offset){offset=0;partial='';}
   while(offset<stat.size){const buffer=Buffer.alloc(Math.min(65536,stat.size-offset));const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);if(!bytesRead)break;offset+=bytesRead;partial+=buffer.subarray(0,bytesRead).toString('utf8');const lines=partial.split('\n');partial=lines.pop();for(const line of lines){try{const e=JSON.parse(line);if(typeof e.id!=='string'||typeof e.at!=='string'||typeof e.type!=='string')continue;const priority=['screen_urgent','report_immediate_danger','screen_unavailable'].includes(e.type)?'URGENT':'REVIEW';const stage = typeof e.stage === 'string' && /^[a-z_]{1,30}$/.test(e.stage) ? ` stage=${e.stage}` : '';const status=Number.isInteger(e.status) && e.status>=400 && e.status<=599 ? ` HTTP=${e.status}` : '';console.log(`${priority} ${e.at} ${e.type} ${e.id}${stage}${status}`);}catch{console.error('Invalid event line: investigate log integrity');}}}
  }finally{await handle.close();}
 }catch(e){console.error(`Safety monitor cannot read the event log: ${e.code || 'check permissions'}`);process.exitCode=1;}
}
console.log('Reviewing safety events. This console is not an emergency service or automatic notification system.');
await poll();if(!process.exitCode)setInterval(poll,5000);
