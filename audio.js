import {spawn} from 'node:child_process';

export class AudioFormatError extends Error {
  constructor(message) { super(message); this.name = 'AudioFormatError'; }
}

// Identify the container by its bytes, not the sometimes-empty or misleading
// MIME type supplied by MediaRecorder. No recording is written to disk.
export function identifyAudio(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]))) return 'webm';
  if (buffer.toString('ascii',4,8) === 'ftyp') return 'mp4';
  if (buffer.toString('ascii',0,4) === 'RIFF' && buffer.toString('ascii',8,12) === 'WAVE') return 'wav';
  if (buffer.toString('ascii',0,4) === 'OggS') return 'ogg';
  if (buffer.toString('ascii',0,3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

let conversions = 0;
function convertOgg(buffer) {
  if (conversions >= 4) throw new AudioFormatError('Audio conversion is temporarily busy.');
  conversions++;
  return new Promise((resolve, reject) => {
    let child, settled = false, size = 0;
    const chunks = [];
    const finish = (error, data) => {
      if (settled) return;
      settled = true; clearTimeout(timer); conversions--;
      if (error) reject(error); else resolve(data);
    };
    const timer = setTimeout(() => { child?.kill('SIGKILL'); finish(new AudioFormatError('Audio conversion timed out.')); }, 10000);
    try {
      child = spawn(process.env.FFMPEG_PATH || 'ffmpeg', [
        '-hide_banner','-loglevel','error','-protocol_whitelist','pipe',
        '-f','ogg','-i','pipe:0','-map','0:a:0','-vn','-ac','1','-ar','16000','-t','20','-f','wav','pipe:1'
      ], {stdio:['pipe','pipe','ignore']});
      child.on('error', () => finish(new AudioFormatError('Audio conversion is unavailable.')));
      child.stdout.on('data', chunk => {
        size += chunk.length;
        if (size > 1024 * 1024) { child.kill('SIGKILL'); finish(new AudioFormatError('Converted audio is too large.')); }
        else chunks.push(chunk);
      });
      child.stdin.on('error', () => {}); // Invalid input can close stdin early.
      child.on('close', code => {
        const data = Buffer.concat(chunks);
        if (code !== 0 || identifyAudio(data) !== 'wav' || data.length <= 44) finish(new AudioFormatError('Audio conversion failed.'));
        else finish(null, data);
      });
      child.stdin.end(buffer);
    } catch { finish(new AudioFormatError('Audio conversion is unavailable.')); }
  });
}

export async function prepareAudio(buffer) {
  const kind = identifyAudio(buffer);
  if (!kind) throw new AudioFormatError('Audio format is not supported.');
  if (kind === 'ogg') return {buffer:await convertOgg(buffer), type:'audio/wav', extension:'wav'};
  const types = {webm:'audio/webm',mp4:'audio/mp4',wav:'audio/wav',mp3:'audio/mpeg'};
  return {buffer,type:types[kind],extension:kind};
}
