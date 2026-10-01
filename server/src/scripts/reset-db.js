/**
 * Veritabanini sifirlar. ONCE yedek alin!
 * Kullanim:  npm run reset-db --workspace server
 *            (veya  node src/scripts/reset-db.js --yes )
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { config } from '../config.js';

const files = [config.dbFile, `${config.dbFile}-wal`, `${config.dbFile}-shm`].filter((f) => fs.existsSync(f));

if (!files.length) {
  console.log(`Veritabani bulunamadi: ${config.dbFile}`);
  process.exit(0);
}

if (!process.argv.includes('--yes')) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question(
    `\nTum veriler silinecek:\n${files.map((f) => `  - ${f}`).join('\n')}\n\nEmin misiniz? (evet/hayir): `
  );
  rl.close();
  if (answer.trim().toLowerCase() !== 'evet') {
    console.log('Iptal edildi.');
    process.exit(0);
  }
}

// Yedek al: silmeden once zaman damgali kopya birak.
const backup = path.join(
  path.dirname(config.dbFile),
  `${path.basename(config.dbFile, '.db')}-yedek-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
);
fs.copyFileSync(config.dbFile, backup);
console.log(`Yedek alindi: ${backup}`);

for (const file of files) {
  fs.rmSync(file, { force: true });
  console.log(`Silindi: ${file}`);
}

console.log('\nVeritabani sifirlandi. Sunucuyu yeniden baslatin, yeni sema otomatik kurulur.');
