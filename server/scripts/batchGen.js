/**
 * Batch image generation script
 * Generates images for all prompts in the DB that don't have locally-generated images
 * Run from server/ dir: node scripts/batchGen.js
 */
import Database from 'better-sqlite3';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');
const DB_FILE = join(__dirname, '..', 'data/lovioa.db');

const BASE_URL = process.env.OPENAI_API_BASE_URL || process.env.VITE_OPENAI_API_BASE_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || '';

const CONCURRENCY = 1;
const DELAY_BETWEEN_BATCHES_MS = 8000;

if (!API_KEY) {
  console.error('Missing OPENAI_API_KEY (or legacy VITE_OPENAI_API_KEY)');
  process.exit(1);
}

if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log('Created uploads directory');
}

const db = new Database(DB_FILE);

// Get all prompts
const prompts = db.prepare('SELECT id, prompt, image_url, category FROM prompts ORDER BY created_at ASC').all();
console.log(`Found ${prompts.length} prompts in DB`);

// Filter out prompts that already have locally generated images (avoid re-generating)
const toGenerate = prompts.filter(p => !p.image_url.startsWith('/uploads/'));
console.log(`Need to generate: ${toGenerate.length} images`);

if (toGenerate.length === 0) {
  console.log('All prompts already have images. Nothing to do.');
  process.exit(0);
}

async function generateImage(promptText, promptId, size = '1024x1024', attempt = 0) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000);

  try {
    const res = await fetch(`${BASE_URL}/images/generations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: promptText,
        size,
        quality: 'medium',
        response_format: 'b64_json',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      // Retry on transient errors: rate limits (429) and upstream errors (502)
      const isRetryable = (res.status === 429 || res.status === 502) && attempt < 2;
      if (isRetryable) {
        const backoffSec = (attempt + 1) * 20;
        console.log(`  [${promptId}] HTTP ${res.status}, retrying in ${backoffSec}s...`);
        await new Promise(r => setTimeout(r, backoffSec * 1000));
        return generateImage(promptText, promptId, size, attempt + 1);
      }
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = JSON.parse(await res.text());
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error('No b64_json in response');
    }

    // Save image
    const ext = 'png';
    const filename = `${promptId}.${ext}`;
    const filepath = join(UPLOADS_DIR, filename);
    const imageBuffer = Buffer.from(b64, 'base64');
    writeFileSync(filepath, imageBuffer);

    const imageUrl = `/uploads/${filename}`;
    console.log(`  [${promptId}] Generated: ${filename} (${(imageBuffer.length / 1024).toFixed(1)}KB)`);
    return imageUrl;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error(`  [${promptId}] Error: ${err.message}`);
    return null;
  }
}

async function runWithConcurrency(items, fn, concurrency) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + concurrency < items.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }
  return results;
}

// Generate images
console.log(`\nGenerating ${toGenerate.length} images (concurrency: ${CONCURRENCY})...`);
console.log('This will take a while. Progress shown below.\n');

const imageUrls = await runWithConcurrency(
  toGenerate,
  async (p) => {
    const url = await generateImage(p.prompt, p.id);
    return { promptId: p.id, url };
  },
  CONCURRENCY
);

// Update DB with new image URLs
const update = db.prepare('UPDATE prompts SET image_url = ? WHERE id = ?');
const updateTx = db.transaction(() => {
  for (const result of imageUrls) {
    if (result.url) {
      update.run(result.url, result.promptId);
    }
  }
});
updateTx();

const successCount = imageUrls.filter(r => r.url !== null).length;
console.log(`\nDone! Generated ${successCount}/${toGenerate.length} images.`);

// Print stats
const finalCount = db.prepare('SELECT COUNT(1) as c FROM prompts').get().c;
const withUploads = db.prepare("SELECT COUNT(1) as c FROM prompts WHERE image_url LIKE '/uploads/%'").get().c;
console.log(`Total prompts: ${finalCount}, with local images: ${withUploads}`);

db.close();
