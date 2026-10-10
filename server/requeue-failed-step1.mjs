/**
 * Re-enqueue all failed step1 editor_items.
 * Directly inserts new gen_jobs and resets editor_items — no module imports needed.
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const db = new Database('./data/lovioa.db');

const DEFAULT_MODEL    = 'gpt-image-2';
const DEFAULT_SIZE     = '1024x1024';
const DEFAULT_QUALITY  = 'medium';
const now = new Date().toISOString();

const batchSize = Number(process.argv[2] || 500);
const dryRun    = String(process.argv[3] || '').toLowerCase() === 'dry';

const failedItems = db.prepare(`
  SELECT id, prompt, category, tags_json, batch_id
  FROM editor_items
  WHERE step1_status = 'failed'
  ORDER BY created_at ASC
  LIMIT ?
`).all(batchSize);

console.log(`Found ${failedItems.length} failed step1 items  (dry=${dryRun} limit=${batchSize})`);

const insertJob = db.prepare(`
  INSERT INTO gen_jobs (id, mode, model, size, quality, prompt, status,
    max_attempts, attempt_count, is_heartbeat, heartbeat_kind, heartbeat_category,
    publish_to_prompts, created_at, updated_at)
  VALUES (?, 'text', ?, ?, ?, ?, 'queued', 2, 0, 1, 'editor_showcase', ?, 0, ?, ?)
`);

const updateItem = db.prepare(`
  UPDATE editor_items
  SET step1_status = 'pending',
      step2_status = 'pending',
      step1_job_id = ?,
      step2_job_id = NULL,
      result_base_url = NULL,
      result_edited_url = NULL,
      published_to_prompts = 0,
      updated_at = ?
  WHERE id = ?
`);

const tx = db.transaction(() => {
  let requeued = 0, errors = 0;
  for (const item of failedItems) {
    try {
      const jobId = randomUUID();
      if (!dryRun) {
        insertJob.run(jobId, DEFAULT_MODEL, DEFAULT_SIZE, DEFAULT_QUALITY,
          item.prompt, item.category || 'Abstract', now, now);
        updateItem.run(jobId, now, item.id);
      }
      requeued++;
      if (requeued % 200 === 0) console.log(`  requeued ${requeued}...`);
    } catch (err) {
      console.warn(`  FAILED ${item.id.slice(0,8)}: ${err.message}`);
      errors++;
    }
  }
  console.log(`Done: requeued=${requeued} errors=${errors}`);
});

tx();

const remaining = db.prepare(`SELECT COUNT(*) as c FROM editor_items WHERE step1_status='failed'`).get();
const queued    = db.prepare(`SELECT COUNT(*) as c FROM gen_jobs WHERE status='queued'`).get();
console.log(`Remaining failed step1: ${remaining.c}  |  Total queued gen_jobs: ${queued.c}`);