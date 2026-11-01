import { test, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.CHILD_SAFETY_REVIEWED = 'false';
Object.assign(process.env,{GIFT_ARCHIVE_DIR:'',GIFT_ARCHIVE_KEY:'',GIFT_ARCHIVE_KEY_FILE:''});
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
test('a client checkbox cannot bypass missing safety reporting configuration', async () => {
 process.env.CHILD_SAFETY_REVIEWED='true';
 delete process.env.SAFETY_EVENTS_FILE;
 const response=await fetch(`${base}/api/session`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({adultPresent:true,language:'English'})});
 assert.equal(response.status,503);
});
