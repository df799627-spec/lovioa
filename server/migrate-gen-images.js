#!/usr/bin/env node
/**
 * migrate-gen-images.js
 *
 * Extracts inline base64 image data from gen_history and generated_images,
 * writes each image to uploads/generated/ as a PNG file,
 * then updates the DB column to store the file URL instead.
 *
 * Run ONCE before starting the server. Safe to re-run (idempotent).
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE   = join(__dirname, 'data/lovioa.db');
const OUT_DIR   = join(__dirname, 'uploads/generated');

// ─── Bootstrap ──────────────────────────────────────────────────────────────
if (!existsSync(DB_FILE)) {
  console.error('DB not found at:', DB_FILE);
  process.exit(1);
}
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const db = Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function decodeBase64Img(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) return null;
  return Buffer.from(dataUrl.slice(prefix.length), 'base64');
}

function imageFilePath(table, id) {
  // preserve the original id as filename slug to avoid collisions
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  return join(OUT_DIR, `${table}_${safe}.png`);
}

// ─── Step 1: Migrate gen_history ──────────────────────────────────────────────
console.log('\n── Step 1: Migrating gen_history ──');

const historyRows = db.prepare(
  "SELECT id, image_url FROM gen_history WHERE image_url LIKE 'data:%'"
).all();

console.log(`  Found ${historyRows.length} base64 rows in gen_history`);

let migratedHistory = 0;
for (const row of historyRows) {
  const buf = decodeBase64Img(row.image_url);
  if (!buf) continue;

  const filePath = imageFilePath('hist', row.id);

  if (existsSync(filePath)) {
    // Already migrated
  } else {
    writeFileSync(filePath, buf);
  }

  // Always update DB to file URL (idempotent)
  const fileUrl = `/uploads/generated/${'hist_' + row.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}.png`;
  db.prepare("UPDATE gen_history SET image_url = ? WHERE id = ?").run(fileUrl, row.id);
  migratedHistory++;
}

console.log(`  → Migrated ${migratedHistory} rows`);

// ─── Step 2: Migrate generated_images ─────────────────────────────────────────
console.log('\n── Step 2: Migrating generated_images ──');

const galleryRows = db.prepare(
  "SELECT id, image_url FROM generated_images WHERE image_url LIKE 'data:%'"
).all();

console.log(`  Found ${galleryRows.length} base64 rows in generated_images`);

let migratedGallery = 0;
for (const row of galleryRows) {
  const buf = decodeBase64Img(row.image_url);
  if (!buf) continue;

  const safeId = row.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const filePath = join(OUT_DIR, `gallery_${safeId}.png`);

  if (!existsSync(filePath)) {
    writeFileSync(filePath, buf);
  }

  const fileUrl = `/uploads/generated/gallery_${safeId}.png`;
  db.prepare("UPDATE generated_images SET image_url = ? WHERE id = ?").run(fileUrl, row.id);
  migratedGallery++;
}

console.log(`  → Migrated ${migratedGallery} rows`);

// ─── Step 3: Migrate gen_jobs result_image_url ─────────────────────────────────
console.log('\n── Step 3: Migrating gen_jobs result_image_url ──');

const jobRows = db.prepare(
  "SELECT id, result_image_url FROM gen_jobs WHERE result_image_url LIKE 'data:%'"
).all();

console.log(`  Found ${jobRows.length} base64 result_image_url rows`);

let migratedJobs = 0;
for (const row of jobRows) {
  const buf = decodeBase64Img(row.result_image_url);
  if (!buf) continue;

  const safeId = row.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48);
  const filePath = join(OUT_DIR, `job_${safeId}.png`);

  if (!existsSync(filePath)) {
    writeFileSync(filePath, buf);
  }

  const fileUrl = `/uploads/generated/job_${safeId}.png`;
  db.prepare("UPDATE gen_jobs SET result_image_url = ? WHERE id = ?").run(fileUrl, row.id);
  migratedJobs++;
}

console.log(`  → Migrated ${migratedJobs} rows`);

// ─── Step 4: Vacuum to reclaim DB space ───────────────────────────────────────
console.log('\n── Step 4: Vacuum ──');
db.exec('VACUUM');
console.log('  → Done');

// ─── Verify ───────────────────────────────────────────────────────────────────
const remainingHistory = db.prepare(
  "SELECT COUNT(*) as c FROM gen_history WHERE image_url LIKE 'data:%'"
).get().c;
const remainingGallery = db.prepare(
  "SELECT COUNT(*) as c FROM generated_images WHERE image_url LIKE 'data:%'"
).get().c;
const remainingJobs = db.prepare(
  "SELECT COUNT(*) as c FROM gen_jobs WHERE result_image_url LIKE 'data:%'"
).get().c;

console.log('\n── Verification ──');
console.log(`  gen_history remaining base64:    ${remainingHistory}`);
console.log(`  generated_images remaining:     ${remainingGallery}`);
console.log(`  gen_jobs result remaining:       ${remainingJobs}`);

const { execSync } = await import('child_process');
const outDirSize = execSync(`du -sb ${OUT_DIR} | cut -f1`).toString().trim();

const dbStat = await import('fs').then(fs => fs.statSync(DB_FILE));
console.log(`\n  DB file size:    ${Math.round(dbStat.size / 1024 / 1024)} MB`);
console.log(`  images moved:    ${Math.round(Number(outDirSize) / 1024 / 1024)} MB into ${OUT_DIR}`);

if (remainingHistory === 0 && remainingGallery === 0 && remainingJobs === 0) {
  console.log('\n✅ Migration complete — all images externalized. Server should now start fast.');
} else {
  console.log('\n⚠️  Some rows still contain base64 — run migration again or check errors above.');
  process.exit(1);
}

db.close();