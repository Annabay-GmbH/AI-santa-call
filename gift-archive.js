import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {mkdir, lstat, open, readdir, readFile, rename, unlink, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {lstatSync, readFileSync} from 'node:fs';

const lifetime = 90 * 24 * 60 * 60 * 1000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const namePattern = /^[a-f0-9]{64}\.gift$/;
const digest = token => createHash('sha256').update(token).digest('hex');

// This archive accepts only an already-screened PDF. It does not receive prompts,
// conversation text, session IDs, names, or IP addresses.
export function createGiftArchive({directory, key, now = Date.now}) {
  if (!path.isAbsolute(directory) || !Buffer.isBuffer(key) || key.length !== 32) throw Error('Invalid archive configuration');
  let timer, scheduledAt = Infinity;
  async function prepare() {
    await mkdir(directory, {recursive:true, mode:0o700});
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw Error('Archive directory must be private');
    const actual = await realpath(directory);
    const publicDir = await realpath(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public'));
    if (actual === publicDir || actual.startsWith(publicDir + path.sep)) throw Error('Archive directory must not be publicly served');
  }
  function schedule(delay) {
    const wait = Math.min(Math.max(delay, 0), 2_147_483_647);
    const due = Date.now() + wait;
    if (timer && due >= scheduledAt) return;
    clearTimeout(timer);
    scheduledAt = due;
    timer = setTimeout(() => {timer=undefined;scheduledAt=Infinity;cleanup().catch(() => schedule(60_000));}, wait);
    timer.unref();
  }
  async function cleanup() {
    await prepare();
    let next = lifetime;
    for (const name of await readdir(directory)) {
      if (/^\.[a-f0-9]{32}\.tmp$/.test(name)) {
        const file=path.join(directory,name);
        try {if ((await lstat(file)).mtimeMs < now()-3_600_000) await unlink(file);} catch(error) {if(error.code !== 'ENOENT') throw error;}
        continue;
      }
      if (!namePattern.test(name)) continue;
      const file = path.join(directory, name);
      try {
        const handle = await open(file, 'r');
        const header = Buffer.alloc(8);
        try { if ((await handle.read(header, 0, 8, 0)).bytesRead !== 8) continue; }
        finally { await handle.close(); }
        const expiry = Number(header.readBigUInt64BE());
        if (expiry <= now()) await unlink(file).catch(error => {if(error.code !== 'ENOENT') throw error;});
        else next = Math.min(next, expiry - now());
      } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    schedule(next);
  }
  async function save(pdf) {
    if (!Buffer.isBuffer(pdf) || !pdf.subarray(0,5).equals(Buffer.from('%PDF-'))) throw Error('Invalid illustrated gift');
    await prepare();
    const token = randomBytes(32).toString('base64url');
    const header = Buffer.alloc(8); header.writeBigUInt64BE(BigInt(now() + lifetime));
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(header);
    const encrypted = Buffer.concat([cipher.update(pdf), cipher.final()]);
    const payload = Buffer.concat([header, iv, cipher.getAuthTag(), encrypted]);
    const target = path.join(directory, `${digest(token)}.gift`);
    const temporary = path.join(directory, `.${randomBytes(16).toString('hex')}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {await handle.writeFile(payload); await handle.sync();} finally {await handle.close();}
      await rename(temporary, target);
    } catch (error) {await unlink(temporary).catch(()=>{}); throw error;}
    // Scan after saving so a newly created, earlier expiry cannot be missed.
    try {await cleanup();} catch {schedule(60_000);}
    return token;
  }
  async function remove(token) {
    if (typeof token !== 'string' || !tokenPattern.test(token)) return false;
    try {await unlink(path.join(directory, `${digest(token)}.gift`)); return true;}
    catch (error) {if (error.code === 'ENOENT') return false; throw error;}
  }
  async function list() {
    await cleanup();
    return (await readdir(directory)).filter(name => namePattern.test(name)).map(name => name.slice(0, -5));
  }
  async function read(id) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw Error('Invalid archive ID');
    const payload = await readFile(path.join(directory, `${id}.gift`));
    if (payload.length < 37 || Number(payload.readBigUInt64BE()) <= now()) throw Error('Gift expired or invalid');
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(8,20));
    decipher.setAAD(payload.subarray(0,8)); decipher.setAuthTag(payload.subarray(20,36));
    return Buffer.concat([decipher.update(payload.subarray(36)), decipher.final()]);
  }
  return {prepare, cleanup, save, remove, list, read, stop:()=>{clearTimeout(timer);timer=undefined;scheduledAt=Infinity;}};
}

export function archiveFromEnvironment() {
  const directory = process.env.GIFT_ARCHIVE_DIR;
  const keyFile = process.env.GIFT_ARCHIVE_KEY_FILE;
  let encoded = process.env.GIFT_ARCHIVE_KEY;
  if (!directory && !encoded && !keyFile) return null;
  if (keyFile) {
    if (encoded || !path.isAbsolute(keyFile)) throw Error('Configure either GIFT_ARCHIVE_KEY or an absolute GIFT_ARCHIVE_KEY_FILE');
    const stat = lstatSync(keyFile);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw Error('Gift archive key file must be private');
    encoded = readFileSync(keyFile,'utf8').trim();
  }
  if (!directory || !path.isAbsolute(directory) || !encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw Error('Configure an absolute GIFT_ARCHIVE_DIR and a base64 32-byte GIFT_ARCHIVE_KEY');
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
  const resolved = path.resolve(directory);
  if (resolved === publicDir || resolved.startsWith(publicDir + path.sep)) throw Error('Gift archive must be outside the public directory');
  return createGiftArchive({directory:resolved, key:Buffer.from(encoded,'base64')});
}
