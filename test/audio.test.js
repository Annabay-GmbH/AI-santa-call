import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {identifyAudio,prepareAudio,AudioFormatError} from '../audio.js';
import {createAudioRecorder} from '../public/audio-format.js';

test('detects containers independently of the browser MIME label', async () => {
 const webm=Buffer.from([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0]);
 const mp4=Buffer.from([0,0,0,24,0x66,0x74,0x79,0x70,0x4d,0x34,0x41,0x20]);
 const wav=Buffer.from('RIFFxxxxWAVE');
 for (const [buf,ext] of [[webm,'webm'],[mp4,'mp4'],[wav,'wav']]) {
  assert.equal(identifyAudio(buf),ext);
  assert.equal((await prepareAudio(buf)).extension,ext);
 }
 assert.equal(identifyAudio(Buffer.from('not an audio recording')),null);
 await assert.rejects(prepareAudio(Buffer.from('not an audio recording')),AudioFormatError);
});

test('selects a supported recording format and falls back after a constructor error', () => {
 class FakeRecorder {
  static isTypeSupported(type){return type.startsWith('audio/webm');}
  constructor(_stream,options){if(options.mimeType==='audio/webm;codecs=opus')throw Error('unsupported');this.mimeType=options.mimeType;}
 }
 assert.equal(createAudioRecorder({},FakeRecorder).mimeType,'audio/webm');
});

test('converts a real Ogg recording to WAV in memory when FFmpeg is installed', async t => {
 let ogg;
 try {ogg=execFileSync(process.env.FFMPEG_PATH || 'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=0.1','-c:a','libopus','-f','ogg','pipe:1'],{timeout:10000});}
 catch {t.skip('FFmpeg with the libopus encoder is not available');return;}
 assert.equal(identifyAudio(ogg),'ogg');
 const result=await prepareAudio(ogg);
 assert.equal(result.extension,'wav');assert.equal(result.type,'audio/wav');assert.equal(identifyAudio(result.buffer),'wav');assert.ok(result.buffer.length>44);
});
