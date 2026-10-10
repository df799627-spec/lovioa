#!/usr/bin/env node
/**
 * Externalize prompt.extra_data.originalImageUrl values that are stored as data URLs.
 * This keeps prompts rows small and avoids JSON serialization explosions.
 *
 * Usage:
 *   node scripts/fix-prompt-extra-data.js --dry-run
 *   node scripts/fix-prompt-extra-data.js --apply
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, '../data/lovioa.db');
const UPLOAD_DIR = join(__dirname, '../uploads/generated');
const APPLY = process.argv.includes('--apply');

if (!existsSync(DB_FILE)) {
  console.error('DB not found:', DB_FILE);
  process.exit(1);
}
if (APPLY && !existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 15000');

function decodeDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  return {
    mime: m[1] || 'image/png',
    buffer: Buffer.from(m[2] || '', 'base64'),
  };
}

function extFromMime(mime = '') {
  const v = String(mime).toLowerCase();
  if (v.includes('jpeg') || v.includes('jpg')) return 'jpg';
  if (v.includes('webp')) return 'webp';
  if (v.includes('gif')) return 'gif';
  return 'png';
}

const rows = db.prepare(`
  SELECT id, extra_data
  FROM prompts
  WHERE extra_data LIKE '%"originalImageUrl":"data:%'
`).all();

let changed = 0;
let skipped = 0;

const tx = db.transaction((items) => {
  for (const row of items) {
    let extra = {};
    try {
      extra = JSON.parse(row.extra_data || '{}');
    } catch {
      skipped += 1;
      continue;
    }

    const original = String(extra.originalImageUrl || '');
    if (!original.startsWith('data:')) {
      skipped += 1;
      continue;
    }

    const parsed = decodeDataUrl(original);
    if (!parsed?.buffer?.length) {
      skipped += 1;
      continue;
    }

    const filename = `prompt-original-${row.id}-${randomUUID()}.${extFromMime(parsed.mime)}`;
    const publicUrl = `/uploads/generated/${filename}`;
    if (APPLY) {
      writeFileSync(join(UPLOAD_DIR, filename), parsed.buffer);
      extra.originalImageUrl = publicUrl;
      db.prepare('UPDATE prompts SET extra_data = ? WHERE id = ?').run(JSON.stringify(extra), row.id);
    }
    changed += 1;
  }
});

tx(rows);

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  candidates: rows.length,
  changed,
  skipped,
}, null, 2));

db.close();
