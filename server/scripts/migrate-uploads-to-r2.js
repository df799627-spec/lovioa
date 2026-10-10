/**
 * Migrate all local uploads to Cloudflare R2.
 *
 * Usage:
 *   node --env-file=.env scripts/migrate-uploads-to-r2.js
 *
 * Env vars required:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *
 * What it does:
 *   1. Recursively finds all image files under server/uploads/
 *   2. Uploads each to R2 in batches of 50 (parallel)
 *   3. Reports progress: total, done, failed
 *   4. After migration, old local files can be deleted manually or with:
 *        find server/uploads/ -type f -delete  (keep the dirs)
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');

// Load env vars from .env file (same logic as server/index.js)
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    let key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(join(__dirname, '..', '.env'));
loadEnvFile(join(__dirname, '.env'));

// ─── Sanity checks ──────────────────────────────────────────────────────────

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('ERROR: Missing required R2 env vars.');
  console.error('Set: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME');
  console.error('You can create a .env file in the server/ directory with these values.');
  process.exit(1);
}

if (!existsSync(UPLOADS_DIR)) {
  console.error(`ERROR: Uploads directory not found: ${UPLOADS_DIR}`);
  process.exit(1);
}

// ─── AWS SDK ────────────────────────────────────────────────────────────────

const { S3Client } = await import('@aws-sdk/client-s3');
const { Upload }    = await import('@aws-sdk/lib-storage');

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ─── Find all image files ────────────────────────────────────────────────────

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp']);

function walkDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else if (IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = walkDir(UPLOADS_DIR);
console.log(`Found ${allFiles.length} image file(s) in ${UPLOADS_DIR}`);
if (allFiles.length === 0) process.exit(0);

// ─── Upload helper ───────────────────────────────────────────────────────────

const BATCH_SIZE = 50;
let done = 0, failed = 0, skipped = 0;
const failedFiles = [];

const extToMime = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};

async function uploadFile(filePath) {
  const buffer  = readFileSync(filePath);
  const ext     = extname(filePath).toLowerCase();
  const mime   = extToMime[ext] || 'image/png';
  // Keep relative path under uploads/ as the R2 key
  const relPath = filePath.replace(UPLOADS_DIR + '/', '').replace(/\\/g, '/');
  const key     = relPath;

  await new Upload({
    client,
    params: {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mime,
      CacheControl: 'public, max-age=31536000, immutable',
    },
    queueSize: 4,
    partSize: 5 * 1024 * 1024,
  }).done();

  return key;
}

// ─── Batch runner ─────────────────────────────────────────────────────────────

async function runBatch(files) {
  return Promise.allSettled(files.map(async (filePath) => {
    try {
      const key = await uploadFile(filePath);
      done++;
      if (done % 100 === 0) {
        console.log(`[progress] ${done}/${allFiles.length} uploaded`);
      }
    } catch (err) {
      failed++;
      failedFiles.push({ file: filePath, error: err.message });
      console.error(`[FAIL] ${filePath}: ${err.message}`);
    }
  }));
}

console.log(`Uploading in batches of ${BATCH_SIZE}...`);
const start = Date.now();

for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
  const batch = allFiles.slice(i, i + BATCH_SIZE);
  await runBatch(batch);
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n=== Migration complete ===');
console.log(`Total files : ${allFiles.length}`);
console.log(`Uploaded   : ${done}`);
console.log(`Failed     : ${failed}`);
console.log(`Time       : ${elapsed}s`);

if (failed > 0) {
  console.log('\nFailed files:');
  failedFiles.forEach(f => console.log(`  ${f.file}: ${f.error}`));
  console.log('\nYou can re-run this script to retry failed uploads.');
  console.log('To delete local files after successful migration:');
  console.log(`  find ${UPLOADS_DIR} -type f -delete`);
} else {
  console.log('\nAll uploads succeeded! You can now delete local files:');
  console.log(`  find ${UPLOADS_DIR} -type f -delete`);
}