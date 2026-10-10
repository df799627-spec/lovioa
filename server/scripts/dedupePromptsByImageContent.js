/**
 * De-duplicate prompts by actual image content.
 *
 * Rules:
 * - Keep the newest row per image content hash.
 * - For non-local URLs, de-duplicate by URL string.
 *
 * Usage:
 *   node dedupePromptsByImageContent.js            # dry run
 *   node dedupePromptsByImageContent.js --apply    # delete duplicates
 */

import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, '../data/lovioa.db');
const apply = process.argv.includes('--apply');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

function keyForImageUrl(url = '') {
  const u = String(url || '');
  if (!u) return 'empty:';
  if (u.startsWith('/')) {
    const rel = u.replace(/^\/+/, '');
    const p = join(__dirname, '..', rel);
    if (!existsSync(p)) return `missing:${u}`;
    const buf = readFileSync(p);
    const hash = createHash('sha1').update(buf).digest('hex');
    return `hash:${hash}`;
  }
  return `url:${u}`;
}

const rows = db.prepare(`
  SELECT id, image_url, created_at
  FROM prompts
  ORDER BY datetime(created_at) DESC, id DESC
`).all();

const seen = new Map();
const dropIds = [];
for (const row of rows) {
  const key = keyForImageUrl(row.image_url);
  if (!seen.has(key)) {
    seen.set(key, row.id);
  } else {
    dropIds.push(row.id);
  }
}

console.log(`Total prompts: ${rows.length}`);
console.log(`Unique image keys: ${seen.size}`);
console.log(`Duplicate rows to delete: ${dropIds.length}`);
console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);

if (apply && dropIds.length) {
  const del = db.prepare('DELETE FROM prompts WHERE id = ?');
  const tx = db.transaction((ids) => {
    for (const id of ids) del.run(id);
  });
  tx(dropIds);
}

const summary = {
  prompts_total: db.prepare('SELECT COUNT(1) AS c FROM prompts').get().c,
  distinct_image_urls: db.prepare('SELECT COUNT(DISTINCT image_url) AS c FROM prompts').get().c,
};
console.log(summary);

db.close();
