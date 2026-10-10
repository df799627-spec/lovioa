/**
 * Reset all editor_items where step1_status='failed' → 'pending',
 * creating fresh gen_jobs so they go through the normal retry queue.
 * Safe to run repeatedly — only targets truly exhausted jobs.
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const db = new Database('./data/lovioa.db');

const DEFAULT_MODEL   = 'gpt-image-2';
const DEFAULT_SIZE    = '1024x1024';
const DEFAULT_QUALITY = 'medium';
const now = new Date().toISOString();

const BATCH = Number(process.argv[2] || 500);
const DRY   = process.argv[2] === 'dry';

const insertJob = db.prepare(`
  INSERT INTO gen_jobs (id, mode, model, size, quality, prompt, status,
    max_attempts, attempt_count, is_heartbeat, heartbeat_kind, heartbeat_category,
    publish_to_prompts, created_at, updated_at)
  VALUES (?, 'text', ?, ?, ?, ?, 'queued', 2, 0, 1, 'editor_showcase', ?, 0, ?, ?)
`);

const updateItem = db.prepare(`
  UPDATE editor_items
  SET step1_status  = 'pending',
      step2_status  = 'pending',
      step1_job_id  = ?,
      step2_job_id  = NULL,
      result_base_url    = NULL,
      result_edited_url = NULL,
      published_to_prompts = 0,
      updated_at = ?
  WHERE id = ?
`);

// Find items where step1 permanently failed:
//   - step1_status = 'failed' AND
//   - the step1 gen_job is either NULL or attempt_count >= max_attempts (exhausted)
// Items whose step1 job is mid-retry (attempt_count < max_attempts, status=queued)
// are SKIPPED — they will be picked up naturally when the retry backoff expires.
const items = db.prepare(`
  SELECT ei.id, ei.prompt, ei.category, ei.step1_job_id,
         gj.status          AS job_status,
         gj.attempt_count   AS attempt_count,
         gj.max_attempts    AS max_attempts
  FROM editor_items ei
  LEFT JOIN gen_jobs gj ON gj.id = ei.step1_job_id
  WHERE ei.step1_status = 'failed'
    AND (
      gj.id IS NULL
      OR (gj.attempt_count >= gj.max_attempts)
      OR gj.status = 'failed'
    )
  ORDER BY ei.created_at ASC
  LIMIT ?
`).all(BATCH);

console.log(`Found ${items.length} exhausted failed-step1 items  (dry=${DRY})`);

let requeued = 0, skipped = 0, errors = 0;

const tx = db.transaction(() => {
  for (const item of items) {
    // Safety: skip if prompt is missing
    if (!item.prompt?.trim()) { skipped++; continue; }

    try {
      const newJobId = randomUUID();
      if (!DRY) {
        insertJob.run(newJobId, DEFAULT_MODEL, DEFAULT_SIZE, DEFAULT_QUALITY,
          item.prompt, item.category || 'Abstract', now, now);
        updateItem.run(newJobId, now, item.id);
      }
      requeued++;
      if (requeued % 200 === 0) process.stderr.write(`  requeued ${requeued}...\n`);
    } catch (err) {
      process.stderr.write(`  FAILED ${item.id.slice(0,8)}: ${err.message}\n`);
      errors++;
    }
  }
});

tx();
console.log(`Done: requeued=${requeued} skipped=${skipped} errors=${errors}`);

// Status snapshot
const counts = db.prepare(`
  SELECT step1_status, step2_status, COUNT(*) as c
  FROM editor_items GROUP BY step1_status, step2_status ORDER BY 1,2
`).all();
for (const r of counts) console.log(`  ${r.step1_status}/${r.step2_status} -> ${r.c}`);

const q = db.prepare(`SELECT COUNT(*) as c FROM gen_jobs WHERE status='queued'`).get();
const r = db.prepare(`SELECT COUNT(*) as c FROM gen_jobs WHERE status='running'`).get();
console.log(`gen_jobs: queued=${q.c} running=${r.c}`);