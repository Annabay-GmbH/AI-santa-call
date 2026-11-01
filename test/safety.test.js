import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {screenContent,recordSafetyEvent} from '../safety.js';
const categories={sexual:false,'sexual/minors':false,violence:false,'self-harm':false,harassment:false,hate:false,illicit:false};
const moderation = () => ({type:'moderation_result',flagged:false,categories:{...categories}});
const model = (decision, changes = {}) => ({responses:{create:async request=>{
 assert.equal(request.moderation.model,'omni-moderation-latest');
 return {output_text:JSON.stringify({decision}),moderation:{input:moderation(),output:moderation(),...changes}};
}}});
test('flagged input or output moderation blocks the response', async()=>{
 const flagged={...moderation(),flagged:true};
 assert.equal(await screenContent(model('safe',{input:flagged}),'sample'),'sensitive');
 assert.equal(await screenContent(model('safe',{output:flagged}),'sample'),'sensitive');
});
test('child-specific classifier can escalate and fails closed',async()=>{
 assert.equal(await screenContent(model('urgent'),'sample'),'urgent');
 assert.equal(await screenContent(model('safe'),'sample'),'safe');
 await assert.rejects(screenContent(model('unknown'),'sample'));
 await assert.rejects(screenContent(model('safe',{input:{type:'error'}}),'sample'));
 await assert.rejects(screenContent(model('safe',{output:undefined}),'sample'));
});
test('event records have fixed fields and reject unsafe destinations and event types',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'santa-safety-'));const file=path.join(dir,'events.jsonl');
 await recordSafetyEvent('screen_urgent',file);const item=JSON.parse((await readFile(file,'utf8')).trim());
 assert.deepEqual(Object.keys(item).sort(),['at','id','type']);assert.equal(item.type,'screen_urgent');
 await assert.rejects(recordSafetyEvent('private transcript',file));await chmod(file,0o644);await assert.rejects(recordSafetyEvent('screen_urgent',file));
});

test('failure diagnostics only persist an allowlisted stage and HTTP status',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'santa-diagnostic-'));const file=path.join(dir,'events.jsonl');
 await recordSafetyEvent('screen_unavailable',file,{stage:'input_moderation',status:403,transcript:'private sample'});
 await recordSafetyEvent('screen_unavailable',file,{stage:'private sample',status:'private sample'});
 const log=await readFile(file,'utf8');const [first,second]=log.trim().split('\n').map(JSON.parse);
 assert.equal(first.stage,'input_moderation');assert.equal(first.status,403);
 assert.equal(second.stage,undefined);assert.equal(second.status,undefined);assert.doesNotMatch(log,/private sample/);
});

test('intermittent 403s retry the same checked request and persistent failures stay closed',async()=>{
 let attempts=0;
 const ai={responses:{create:async request=>{assert.equal(request.moderation.model,'omni-moderation-latest');attempts++;if(attempts<3)throw Object.assign(new Error('forbidden'),{status:403});return {output_text:'{"decision":"safe"}',moderation:{input:moderation(),output:moderation()}};}}};
 assert.equal(await screenContent(ai,'synthetic test'),'safe');assert.equal(attempts,3);
 attempts=0;ai.responses.create=async()=>{attempts++;throw Object.assign(new Error('forbidden'),{status:403});};
 await assert.rejects(screenContent(ai,'synthetic test'));assert.equal(attempts,3);
});
