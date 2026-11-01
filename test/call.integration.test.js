import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {PDFDocument} from 'pdf-lib';
const dir=await mkdtemp(path.join(tmpdir(),'santa-integration-'));
Object.assign(process.env,{NODE_ENV:'test',CHILD_SAFETY_REVIEWED:'true',OPENAI_API_KEY:'test-key',SAFETY_EVENTS_FILE:path.join(dir,'events.jsonl')});
const {default:app}=await import('../server.js');const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
after(()=>server.close());
const postSession=body=>fetch(base+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const consent={adultPresent:true,language:'English'};
const fakeGift=(theme,title,message)=>({theme,title,message,page1:'A friendly cat beneath bright stars.',page2:'A friendly cat explores a moonlit garden.'});
const tinyPng='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
test('each call requires adult acknowledgement and a supported language',async()=>{
 for(const body of [{adultPresent:false,language:'English'}, {adultPresent:true,language:'unknown'}, {language:'English'}]) assert.equal((await postSession(body)).status,400);
 const response=await postSession(consent);assert.equal(response.status,200);const {id}=await response.json();assert.ok(id);assert.equal((await fetch(`${base}/api/session/${id}`,{method:'DELETE'})).status,200);
});
test('reports accept categories only and persist no child-provided text',async()=>{
 const post=body=>fetch(base+'/api/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post({category:'immediate_danger',detail:'private information'})).status,400);
 assert.equal((await post({category:'immediate_danger'})).status,202);
 const log=await readFile(process.env.SAFETY_EVENTS_FILE,'utf8');assert.match(log,/report_immediate_danger/);assert.doesNotMatch(log,/private information/);
});
async function authorizedCall(){const response=await postSession(consent);assert.equal(response.status,200);return (await response.json()).id;}
function fakeAI(decisions){
 const calls={generation:0,speech:0,screens:[],images:[],imageChecks:0};let index=0;
 return {calls, images:{generate:async options=>{calls.images.push(options);return {data:[{b64_json:tinyPng}]};}}, audio:{transcriptions:{create:async()=>({text:'A pretend test message'})},speech:{create:async options=>{calls.speech++;calls.speechOptions=options;return new Response('audio');}}}, moderations:{create:async()=>({results:[{flagged:false,categories:{sexual:false,'sexual/minors':false,violence:false,'self-harm':false,harassment:false,hate:false,illicit:false}}]})}, responses:{create:async(options)=>{if(options.text?.format?.name==='gift_image_safety'){calls.imageChecks++;const check={type:'moderation_result',flagged:false,categories:{sexual:false,'sexual/minors':false,violence:false,'self-harm':false,harassment:false,hate:false,illicit:false}};return {status:'completed',output_text:JSON.stringify({decision:'safe'}),moderation:{input:check,output:check}};}if(options.text?.format?.name==='child_safety'){calls.screens.push(JSON.parse(options.input));const decision=decisions[index++];if(decision==='failure')throw Error('filter failed');const check={type:'moderation_result',flagged:false,categories:{sexual:false,'sexual/minors':false,violence:false,'self-harm':false,harassment:false,hate:false,illicit:false}};assert.equal(options.moderation.model,'omni-moderation-latest');return {output_text:JSON.stringify({decision}),moderation:{input:check,output:check}};}assert.equal(options.text?.format?.name,'santa_reply');assert.equal(options.text.format.strict,true);calls.generation++;return {output_text:JSON.stringify({reply:'A pretend test answer.',gift:fakeGift('star','A starlight paintbrush','For your starry drawings.')})};}}};
}
async function sendTurn(id){const body=new FormData();body.append('audio',new Blob([new Uint8Array([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0])],{type:'video/webm'}),'test.webm');return fetch(`${base}/api/turn/${id}`,{method:'POST',body});}
test('urgent input, sensitive output, and unavailable screening never play unchecked audio',async()=>{
 for(const [decisions,expectedGeneration] of [[['urgent'],0],[['safe','sensitive'],1],[['failure'],0]]){
  const id=await authorizedCall(), ai=fakeAI(decisions);app.locals.createOpenAIClient=()=>ai;
  const response=await sendTurn(id);const body=await response.json();assert.equal(decisions[0] === 'failure' ? body.safetyUnavailable : body.safety,true);assert.equal(ai.calls.generation,expectedGeneration);assert.equal(ai.calls.speech,0);
  assert.equal((await sendTurn(id)).status,404);
 }
 const log=await readFile(process.env.SAFETY_EVENTS_FILE,'utf8');assert.match(log,/screen_urgent/);assert.match(log,/screen_blocked_output/);assert.match(log,/screen_unavailable/);assert.doesNotMatch(log,/pretend test/);
});
test('safe content reaches speech only after input and output checks',async()=>{
 const id=await authorizedCall(),ai=fakeAI(['safe','safe']);app.locals.createOpenAIClient=()=>ai;
 const response=await sendTurn(id),body=await response.json();assert.equal(response.status,200);assert.equal(body.reply,'A pretend test answer.');assert.equal(ai.calls.generation,1);assert.equal(ai.calls.speech,1);assert.equal(ai.calls.speechOptions.input,body.reply);assert.match(ai.calls.speechOptions.instructions,/cheerful/);assert.ok(body.audio);const checked=JSON.parse(ai.calls.screens[1].latest);assert.equal(checked.gift.title,'A starlight paintbrush');const gift=await (await fetch(`${base}/api/session/${id}`,{method:'DELETE'})).json();assert.equal(gift.gift.message,'For your starry drawings.');
});
test('a Persian call preserves a structured Persian reply through speech generation',async()=>{
 const start=await postSession({adultPresent:true,language:'فارسی'});assert.equal(start.status,200);const {id}=await start.json();
 const ai=fakeAI(['safe','safe']),original=ai.responses.create;let spoken, voiceInstructions;
 ai.responses.create=async options=>options.text?.format?.name==='santa_reply' ? (assert.equal(options.text.format.strict,true),{status:'completed',output_text:JSON.stringify({reply:'سلام دوست عزیز!',gift:fakeGift('star','ستاره جادویی','برای نقاشی‌هایت.')})}) : original(options);
 ai.audio.speech.create=async options=>{spoken=options.input;voiceInstructions=options.instructions;return new Response('audio')};app.locals.createOpenAIClient=()=>ai;
 const result=await sendTurn(id),body=await result.json();assert.equal(result.status,200);assert.equal(body.reply,'سلام دوست عزیز!');assert.equal(spoken,body.reply);assert.match(voiceInstructions,/supplied language naturally/);assert.ok(body.audio);
});
test('an incomplete generation never reaches speech playback',async()=>{
 const id=await authorizedCall(),ai=fakeAI(['safe']),original=ai.responses.create;
 ai.responses.create=async options=>options.text?.format?.name==='santa_reply' ? {status:'incomplete',output_text:''} : original(options);app.locals.createOpenAIClient=()=>ai;
 const result=await sendTurn(id),body=await result.json();assert.equal(result.status,503);assert.equal(body.safetyUnavailable,true);assert.equal(ai.calls.speech,0);
});

test('legacy speech models do not receive unsupported voice instructions',async()=>{
 const previous=process.env.OPENAI_TTS_MODEL;process.env.OPENAI_TTS_MODEL='tts-1';
 try {const id=await authorizedCall(),ai=fakeAI(['safe','safe']);app.locals.createOpenAIClient=()=>ai;const result=await sendTurn(id);assert.equal(result.status,200);assert.equal(ai.calls.speechOptions.instructions,undefined);}
 finally {if(previous===undefined)delete process.env.OPENAI_TTS_MODEL;else process.env.OPENAI_TTS_MODEL=previous;}
});

test('the final gift follows the latest safe conversation turn',async()=>{
 const id=await authorizedCall(), ai=fakeAI(['safe','safe','safe','safe']);const original=ai.responses.create;let turn=0;
 ai.responses.create=async options=>{
  if(options.text?.format?.name!=='santa_reply')return original(options);
  turn++;
  const gift=turn===1 ? fakeGift('art','Starry paintbrush','For your drawings.') : fakeGift('cat','Moonlit cat companion','For your love of cats.');
  return {status:'completed',output_text:JSON.stringify({reply:'A kind reply.',gift})};
 };
 app.locals.createOpenAIClient=()=>ai;assert.equal((await sendTurn(id)).status,200);assert.equal((await sendTurn(id)).status,200);
 const result=await (await fetch(`${base}/api/session/${id}`,{method:'DELETE'})).json();assert.deepEqual(result.gift,{theme:'cat',title:'Moonlit cat companion',message:'For your love of cats.'});
 const checked=JSON.parse(ai.calls.screens[3].latest);assert.equal(checked.gift.theme,'cat');
});
test('an unsafe gift prevents speech and is never returned',async()=>{
 const id=await authorizedCall(),ai=fakeAI(['safe','sensitive']);app.locals.createOpenAIClient=()=>ai;
 const response=await sendTurn(id);assert.equal((await response.json()).safety,true);assert.equal(ai.calls.speech,0);
 const gift=await (await fetch(`${base}/api/session/${id}`,{method:'DELETE'})).json();assert.equal(gift.gift,null);
});

test('finishing a call creates a private one-use two-page illustrated PDF without sending the transcript to image generation',async()=>{
 const id=await authorizedCall(),ai=fakeAI(['safe','safe']);app.locals.createOpenAIClient=()=>ai;
 assert.equal((await sendTurn(id)).status,200);
 const finish=await fetch(`${base}/api/session/${id}/finish`,{method:'POST'});const data=await finish.json();assert.equal(finish.status,200);assert.equal(data.gift.title,'A starlight paintbrush');assert.match(data.bookToken,/^[A-Za-z0-9_-]{43}$/);assert.equal(data.gift.page1,undefined);
 const request=()=>fetch(`${base}/api/gifts/book`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:data.bookToken})});
 const response=await request();assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/pdf/);
 const pdf=await PDFDocument.load(await response.arrayBuffer());assert.equal(pdf.getPageCount(),2);assert.equal(ai.calls.images.length,2);assert.equal(ai.calls.imageChecks,2);
 assert.match(ai.calls.images[0].prompt,/friendly cat beneath bright stars/);assert.match(ai.calls.images[1].prompt,/moonlit garden/);assert.ok(ai.calls.images.every(x=>!x.prompt.includes('A pretend test message')));
 assert.equal((await request()).status,410);assert.equal(ai.calls.images.length,2);
});
test('unsafe generated illustrations cannot be downloaded',async()=>{
 const id=await authorizedCall(),ai=fakeAI(['safe','safe']),original=ai.responses.create;
 ai.responses.create=async options=>{if(options.text?.format?.name==='gift_image_safety'){const check={type:'moderation_result',flagged:true,categories:{sexual:false,'sexual/minors':false,violence:true,'self-harm':false,harassment:false,hate:false,illicit:false}};return {output_text:'{"decision":"unsafe"}',moderation:{input:check,output:check}};}return original(options);};
 app.locals.createOpenAIClient=()=>ai;assert.equal((await sendTurn(id)).status,200);const data=await (await fetch(`${base}/api/session/${id}/finish`,{method:'POST'})).json();
 const response=await fetch(`${base}/api/gifts/book`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:data.bookToken})});assert.equal(response.status,503);assert.notEqual(response.headers.get('content-type'),'application/pdf');assert.equal(ai.calls.images.length,1);
});

test('a call without an approved gift cannot create a book token',async()=>{
 const id=await authorizedCall();const response=await fetch(`${base}/api/session/${id}/finish`,{method:'POST'});
 assert.deepEqual(await response.json(),{gift:null,bookToken:null});
 const invalid=await fetch(`${base}/api/gifts/book`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:'a'.repeat(43)})});assert.equal(invalid.status,410);
});

test('missing image moderation fails closed without returning a PDF',async()=>{
 const id=await authorizedCall(),ai=fakeAI(['safe','safe']),original=ai.responses.create;
 ai.responses.create=async options=>options.text?.format?.name==='gift_image_safety' ? {output_text:'{"decision":"safe"}',moderation:{input:{type:'error'}}} : original(options);
 app.locals.createOpenAIClient=()=>ai;assert.equal((await sendTurn(id)).status,200);const data=await (await fetch(`${base}/api/session/${id}/finish`,{method:'POST'})).json();
 const result=await fetch(`${base}/api/gifts/book`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:data.bookToken})});assert.equal(result.status,503);assert.equal((await result.json()).code,'book_unavailable');
 const log=(await readFile(process.env.SAFETY_EVENTS_FILE,'utf8')).trim().split('\n').map(JSON.parse);assert.ok(log.some(event=>event.type==='screen_unavailable'&&event.stage==='gift_image_check'));
});
