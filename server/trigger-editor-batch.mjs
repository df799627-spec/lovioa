/**
 * Manually trigger the editor batch to run.
 * Directly calls the already-running server's worker.
 */
import { readFileSync, existsSync } from 'fs';
import Database from 'better-sqlite3';
import { createEditorBatch } from './db/promptsRepo.js';

// Load .env manually
const envPath = './.env';
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const batchSize = Number(process.argv[2] || process.env.EDITOR_BATCH_SIZE || 12);
const apiKey = (
  process.env.EDITOR_BATCH_DEEPSEEK_API_KEY ||
  process.env.HEARTBEAT_DEEPSEEK_API_KEY ||
  process.env.DEEPSEEK_API_KEY ||
  ''
).trim();

console.log(`Triggering editor batch (size=${batchSize}), deepseekApiKey set: ${Boolean(apiKey)}`);

// Check current state first
const db = new Database('./data/lovioa.db');
const counts = db.prepare(`
  SELECT step1_status, step2_status, published_to_prompts, COUNT(*) as c
  FROM editor_items
  GROUP BY step1_status, step2_status, published_to_prompts
`).all();
console.log('Current editor_items:', JSON.stringify(counts));

// Trigger via HTTP POST to the running server
const res = await fetch('http://localhost:3001/api/admin/editor-batch/run', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ batchSize }),
});
const text = await res.text();
console.log(`Response ${res.status}: ${text.slice(0, 200)}`);