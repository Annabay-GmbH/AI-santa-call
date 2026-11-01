import {test} from 'node:test';
import assert from 'node:assert/strict';
import {speechLevel,smoothSpeechLevel} from '../public/speech-animation.js';

test('speech animation stays closed for silence and opens more for louder audio', () => {
  const silence = new Uint8Array(512).fill(128);
  const quiet = Uint8Array.from({length:512}, (_,i) => i%2 ? 132 : 124);
  const loud = Uint8Array.from({length:512}, (_,i) => i%2 ? 160 : 96);
  assert.equal(speechLevel(silence),0);
  assert.ok(speechLevel(quiet)>0);
  assert.ok(speechLevel(loud)>speechLevel(quiet));
  assert.ok(speechLevel(loud)<=1);
});

test('mouth movement smoothly approaches speech and returns to rest', () => {
  const opened = smoothSpeechLevel(0,1);
  assert.ok(opened>0 && opened<1);
  const closing = smoothSpeechLevel(opened,0);
  assert.ok(closing>0 && closing<opened);
});
