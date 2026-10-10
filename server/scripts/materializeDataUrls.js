/**
 * Convert data: URLs in DB to real files under /server/uploads/generated,
 * then rewrite image_url to /uploads/generated/<file>.
 *
 * Usage:
 *   node materializeDataUrls.js            # dry run
 *   node materializeDataUrls.js --apply    # write files + update DB
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, '../data/lovioa.db');
const UPLOAD_DIR = join(__dirname, '../uploads/generated');
const apply = process.argv.includes('--apply');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

if (!existsSync(UPLOAD_DIR) && apply) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

function extFromMime(mime = '') {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
}

function decodeDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const mime = m[1] || 'image/png';
  const b64 = m[2] || '';
  return { mime, buffer: Buffer.from(b64, 'base64') };
}

const tables = [
  { name: 'prompts', idCol: 'id' },
  { name: 'generated_images', idCol: 'id' },
  { name: 'gen_history', idCol: 'id' },
];

let totalCandidates = 0;
let converted = 0;
let failed = 0;

for (const t of tables) {
  const rows = db.prepare(`SELECT ${t.idCol} as id, image_url FROM ${t.name} WHERE image_url LIKE 'data:%'`).all();
  totalCandidates += rows.length;

  const updates = [];
  for (const row of rows) {
    try {
      const parsed = decodeDataUrl(row.image_url);
      if (!parsed || !parsed.buffer?.length) {
        failed++;
        continue;
      }
      const ext = extFromMime(parsed.mime);
      const filename = `${t.name}-${row.id}.${ext}`;
      const filePath = join(UPLOAD_DIR, filename);
      const publicUrl = `/uploads/generated/${filename}`;

      if (apply) {
        writeFileSync(filePath, parsed.buffer);
      }
      updates.push({ id: row.id, image_url: publicUrl });
      converted++;
    } catch {
      failed++;
    }
  }

  if (apply && updates.length > 0) {
    const stmt = db.prepare(`UPDATE ${t.name} SET image_url = @image_url WHERE ${t.idCol} = @id`);
    const tx = db.transaction((items) => {
      for (const item of items) stmt.run(item);
    });
    tx(updates);
  }
}

console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
console.log(`Candidates: ${totalCandidates}`);
console.log(`Converted: ${converted}`);
console.log(`Failed: ${failed}`);

const summary = {
  prompts_data_urls: db.prepare("SELECT COUNT(1) as c FROM prompts WHERE image_url LIKE 'data:%'").get().c,
  prompts_upload_urls: db.prepare("SELECT COUNT(1) as c FROM prompts WHERE image_url LIKE '/uploads/%'").get().c,
  generated_images_data_urls: db.prepare("SELECT COUNT(1) as c FROM generated_images WHERE image_url LIKE 'data:%'").get().c,
  gen_history_data_urls: db.prepare("SELECT COUNT(1) as c FROM gen_history WHERE image_url LIKE 'data:%'").get().c,
  generated_images_upload_urls: db.prepare("SELECT COUNT(1) as c FROM generated_images WHERE image_url LIKE '/uploads/%'").get().c,
  gen_history_upload_urls: db.prepare("SELECT COUNT(1) as c FROM gen_history WHERE image_url LIKE '/uploads/%'").get().c,
};
console.log(summary);

db.close();
