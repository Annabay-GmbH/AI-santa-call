import 'dotenv/config';
import {open} from 'node:fs/promises';
import {archiveFromEnvironment} from '../gift-archive.js';

const archive = archiveFromEnvironment();
if (!archive) throw Error('Configure GIFT_ARCHIVE_DIR and GIFT_ARCHIVE_KEY first.');
const [command, value, destination] = process.argv.slice(2);
try {
  if (command === 'list' && !value) {
    for (const id of await archive.list()) console.log(id);
  } else if (command === 'export' && value && destination) {
    const pdf = await archive.read(value);
    const file = await open(destination, 'wx', 0o600);
    try {await file.writeFile(pdf);} finally {await file.close();}
    console.log('Exported the illustrated PDF.');
  } else if (command === 'cleanup' && !value) {
    await archive.cleanup(); console.log('Expired archive entries removed.');
  } else if (command === 'delete' && value && !destination) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw Error('Invalid deletion code.');
    await archive.remove(value); console.log('Server copy deleted or already absent.');
  } else {
    throw Error('Usage: node scripts/gift-archive.js list | export <archive-id> <new-file.pdf> | cleanup | delete <deletion-code>');
  }
} finally {archive.stop();}
