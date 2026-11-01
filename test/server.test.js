import { test, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.CHILD_SAFETY_REVIEWED = 'false';
const { default: app } = await import('../server.js');
const server = app.listen(0);
await new Promise(resolve => server.once('listening', resolve));
after(() => server.close());
const base = `http://127.0.0.1:${server.address().port}`;
test('calls are disabled by default even if a key exists', async () => {
 process.env.OPENAI_API_KEY = 'test-key';
 const status = await fetch(`${base}/api/status`); assert.deepEqual(await status.json(), {available:false});
 const response = await fetch(`${base}/api/session`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({adultPresent:true,language:'English'})}); assert.equal(response.status,503);
});
test('sessions require adult acknowledgement and an allowlisted language', async () => {
 process.env.CHILD_SAFETY_REVIEWED='true';
 for (const body of [{adultPresent:false,language:'English'}, {adultPresent:true,language:'Unknown'}]) {
  const response=await fetch(`${base}/api/session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.equal(response.status,400);
 }
 const response=await fetch(`${base}/api/session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({adultPresent:true,language:'English'})});assert.equal(response.status,200);const {id}=await response.json();assert.ok(id);
 const end=await fetch(`${base}/api/session/${id}`,{method:'DELETE'});assert.deepEqual(await end.json(),{gift:'star'});
 const turn=await fetch(`${base}/api/turn/${id}`,{method:'POST'});assert.equal(turn.status,404);
});
