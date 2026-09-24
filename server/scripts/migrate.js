/**
 * Lovioa Legacy JSON → SQLite Migration Script
 *
 * Reads all JSON prompt files from data/ and imports successful prompts
 * (status === 'ok' with a valid imageUrl) into the SQLite database.
 *
 * Usage:
 *   node migrate.js           # dry-run (shows what would be imported)
 *   node migrate.js --apply  # actually writes to the database
 *   node migrate.js --force   # skip duplicate ID check, import everything
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// server/data/  — the directory with lovioa.db and the canonical prompts.json
const DB_FILE   = join(__dirname, '../data/lovioa.db');
const SERVER_DATA = join(__dirname, '../data');
// project data/ — legacy coser/beauty JSON files
const PROJECT_DATA = join(__dirname, '../../data');

// ── CLI args ──────────────────────────────────────────────────────────────────
const dryRun   = !process.argv.includes('--apply');
const forceAll = process.argv.includes('--force');

if (dryRun) {
  console.log('\n🔍 DRY RUN — no changes will be written.\n   Pass --apply to commit the migration.\n');
}

// ── Connect to DB ─────────────────────────────────────────────────────────────
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// ── Load all JSON files from data/ ───────────────────────────────────────────
function loadAllJsonFiles(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  const all = [];
  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
      if (Array.isArray(raw)) {
        for (const item of raw) {
          item._srcFile = file;
          all.push(item);
        }
      }
    } catch (e) {
      console.warn(`⚠ Could not parse ${file}: ${e.message}`);
    }
  }
  return all;
}

// ── Normalize a raw item into a DB-ready prompt ───────────────────────────────
function normalize(item) {
  // Only import items that have a valid image path/URL
  const hasImage = !!(item.imageUrl || item.imagePath);
  // Treat null/undefined/missing status as "ok" (legacy data didn't always set status)
  const isOk = !item.status || item.status === 'ok';
  if (!isOk || !hasImage) return null;

  // Resolve the public URL
  let imageUrl = item.imageUrl || item.imagePath || '';
  if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
    imageUrl = '/' + imageUrl;
  }
  // Normalize Windows paths in imagePath
  if (item.imagePath && !imageUrl.startsWith('/')) {
    imageUrl = '/' + imageUrl.replace(/^[A-Z]:/, '').replace(/\\/g, '/');
  }

  const id = String(item.id || '').trim();
  if (!id) return null;

  const title   = item.title || '';
  const prompt  = item.prompt || '';
  const category = (item.category || 'Portrait').trim();
  const tags    = Array.isArray(item.tags) ? item.tags : [];

  // Map legacy categories to app categories
  const CATEGORY_MAP = {
    'Coser':    'Fashion',
    'Cosplay':  'Fashion',
    'Portrait': 'Portrait',
    'Editorial':'Editorial',
    'Landscape':'Landscape',
    'Abstract': 'Abstract',
    'Fashion':  'Fashion',
    'Street':   'Street',
  };
  const finalCategory = CATEGORY_MAP[category] || category;

  // Fallback author info
  const authorName = item.author_name || item.author?.name || 'Lovioa';
  const authorAvatar = item.author_avatar || item.author?.avatar ||
    `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(authorName)}&backgroundColor=B5622A&fontSize=40`;

  // createdAt fallback
  const createdAt = item.createdAt || item.created_at || new Date().toISOString().slice(0, 10);

  return {
    id, title, prompt, imageUrl,
    category: finalCategory,
    tags: tags.slice(0, 8),
    author_name: authorName,
    author_avatar: authorAvatar,
    author_prompt_count: Number(item.author_prompt_count || item.author?.promptCount || 0),
    created_at: createdAt,
  };
}

// Load from both server/data (main prompts.json) and project data/
const rawItems = [...loadAllJsonFiles(SERVER_DATA), ...loadAllJsonFiles(PROJECT_DATA)];
console.log(`Loaded ${rawItems.length} raw items from server/data + project/data/`);
const normalized = rawItems.map(normalize).filter(Boolean);

// Deduplicate: keep the one with an actual image (prefer earlier files)
const seen = new Map();
for (const item of normalized) {
  const existing = seen.get(item.id);
  if (!existing) {
    seen.set(item.id, item);
  } else if (!existing.imageUrl && item.imageUrl) {
    seen.set(item.id, item); // upgrade to version with image
  } else if (existing.imageUrl && item.imageUrl && item._srcFile && item._srcFile !== existing._srcFile) {
    // If same ID in multiple files, prefer the one with a prompt text
    if (item.prompt && !existing.prompt) seen.set(item.id, item);
  }
}

const toImport = [...seen.values()];

// ── Filter already-imported ───────────────────────────────────────────────────
if (!forceAll) {
  const existingIds = new Set(
    db.prepare('SELECT id FROM prompts').all().map(r => r.id)
  );
  const before = toImport.length;
  const filtered = toImport.filter(p => !existingIds.has(p.id));
  console.log(`Found ${toImport.length} unique prompts. ${filtered.length} new (${before - filtered.length} already in DB).\n`);
  toImport.length = 0;
  toImport.push(...filtered);
} else {
  console.log(`Force mode: importing ${toImport.length} prompts (may create duplicates).\n`);
}

if (toImport.length === 0) {
  console.log('✅ Nothing to import.');
  process.exit(0);
}

// ── Print preview ─────────────────────────────────────────────────────────────
console.log('━━━ PROMPTS TO IMPORT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
for (const p of toImport) {
  const imgStatus = p.imageUrl ? '🖼' : '⚠';
  console.log(`  ${imgStatus} [${p.id}]`);
  console.log(`     Title:    ${p.title || '(untitled)'}`);
  console.log(`     Category: ${p.category}`);
  console.log(`     Tags:     ${p.tags.slice(0, 5).join(', ') || '(none)'}`);
  console.log(`     Image:    ${p.imageUrl || '(no URL)'}`);
  console.log(`     Author:   ${p.author_name}`);
  console.log(`     Source:   ${p._srcFile}`);
  console.log('');
}
console.log(`Total: ${toImport.length} prompt(s)\n`);

// ── Apply ─────────────────────────────────────────────────────────────────────
if (dryRun) {
  console.log('⏸ Dry run — rerun with --apply to write to the database.\n');
} else {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO prompts (
      id, image_url, prompt, author_name, author_avatar, author_prompt_count,
      tags_json, category, likes, liked, saved, created_at
    ) VALUES (
      @id, @image_url, @prompt, @author_name, @author_avatar, @author_prompt_count,
      @tags_json, @category, 0, 0, 0, @created_at
    )
  `);
  const insertAll = db.prepare(`
    INSERT OR REPLACE INTO prompts (
      id, image_url, prompt, author_name, author_avatar, author_prompt_count,
      tags_json, category, likes, liked, saved, created_at
    ) VALUES (
      @id, @image_url, @prompt, @author_name, @author_avatar, @author_prompt_count,
      @tags_json, @category, @likes, @liked, @saved, @created_at
    )
  `);

  const inserted = [];
  const errors   = [];

  const tx = db.transaction(() => {
    for (const p of toImport) {
      try {
        if (forceAll) {
          insertAll.run({
            id:          p.id,
            image_url:   p.imageUrl,
            prompt:      p.prompt,
            author_name: p.author_name,
            author_avatar: p.author_avatar,
            author_prompt_count: p.author_prompt_count,
            tags_json:   JSON.stringify(p.tags.slice(0, 8)),
            category:    p.category,
            likes:       0,
            liked:       0,
            saved:       0,
            created_at:  p.created_at,
          });
        } else {
          insert.run({
            id:          p.id,
            image_url:   p.imageUrl,
            prompt:      p.prompt,
            author_name: p.author_name,
            author_avatar: p.author_avatar,
            author_prompt_count: p.author_prompt_count,
            tags_json:   JSON.stringify(p.tags.slice(0, 8)),
            category:    p.category,
            created_at:  p.created_at,
          });
        }
        inserted.push(p.id);
      } catch (e) {
        errors.push({ id: p.id, err: e.message });
      }
    }
  });
  tx();

  console.log(`✅ Imported ${inserted.length} prompt(s).`);
  if (errors.length) {
    console.log(`❌ Failed: ${errors.map(e => e.id).join(', ')}`);
    for (const e of errors) console.log(`   ${e.id}: ${e.err}`);
  }
  console.log('');
}

db.close();
