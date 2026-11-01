import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readdir, readFile, rm, writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createGiftArchive} from '../gift-archive.js';

test('gift archive encrypts output, supports deletion, and removes expired entries', async () => {
 const directory=await mkdtemp(path.join(tmpdir(),'santa-gifts-')),key=randomBytes(32);let clock=1_800_000_000_000;
 const archive=createGiftArchive({directory,key,now:()=>clock});
 try {
  const pdf=Buffer.from('%PDF-1.7\nsynthetic gift illustration only');
  const code=await archive.save(pdf);assert.match(code,/^[A-Za-z0-9_-]{43}$/);
  const [filename]=await readdir(directory), raw=await readFile(path.join(directory,filename));
  assert.equal(raw.includes(pdf),false);assert.equal(raw.includes(Buffer.from('synthetic gift')),false);
  const [id]=await archive.list();assert.deepEqual(await archive.read(id),pdf);
  assert.equal(await archive.remove('invalid'),false);
  assert.equal(await archive.remove(code),true);assert.equal(await archive.remove(code),false);
  await archive.save(pdf);clock += 90*24*60*60*1000;
  await archive.cleanup();assert.deepEqual(await readdir(directory),[]);
 } finally {archive.stop();await rm(directory,{recursive:true,force:true});}
});

test('archive authenticates encrypted gift data and rejects non-PDF inputs',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'santa-gifts-')), archive=createGiftArchive({directory,key:randomBytes(32)});
 try {
  await assert.rejects(archive.save(Buffer.from('conversation text')));
  await archive.save(Buffer.from('%PDF-1.7\nsynthetic'));
  const [filename]=await readdir(directory),file=path.join(directory,filename),bytes=await readFile(file);bytes[bytes.length-1]^=1;await writeFile(file,bytes);
  await assert.rejects(archive.read(filename.slice(0,-5)));
 } finally {archive.stop();await rm(directory,{recursive:true,force:true});}
});
