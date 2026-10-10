/**
 * Repair repair-step1-status.mjs
 *
 * Fixes editor_items where:
 *   - step1_status = 'failed'
 *   - step2_status = 'pending'
 *   - step1_job is in 'queued' (retry in progress) or 'running'
 *
 * The step1 job was retried (reset to queued with attempt_count=0 or 1)
 * but editor_items.step1_status was not restored to 'pending'.
 * Without this fix, step2 stays blocked.
 *
 * Run: node server/repair-step1-status.mjs
 */

import Database from 'better-sqlite3';
const db = new Database('./data/lovioa.db');

// Find editor_items where step1 is retriable but status is wrong
const toRepair = db.prepare(`
  SELECT ei.id as item_id, ei.step1_job_id, j.status as job_status,
         j.attempt_count, j.max_attempts, j.mode
  FROM editor_items ei
  JOIN gen_jobs j ON j.id = ei.step1_job_id
  WHERE ei.step1_status = 'failed'
    AND ei.step2_status = 'pending'
    AND j.status IN ('queued', 'running')
    AND j.attempt_count < j.max_attempts
`).all();

console.log(`Found ${toRepair.length} editor_items needing step1_status repair`);

const now = new Date().toISOString();
let updated = 0;

for (const row of toRepair) {
  db.prepare(`
    UPDATE editor_items
    SET step1_status = 'pending',
        updated_at = ?
    WHERE id = ?
  `).run(now, row.item_id);
  updated++;
  if (updated % 50 === 0) console.log(`  updated ${updated}...`);
}

console.log(`Done. Updated ${updated} items.`);

// Verify
const counts = db.prepare(`
  SELECT step1_status, step2_status, COUNT(*) as c
  FROM editor_items
  GROUP BY 1, 2
  ORDER BY 1, 2
`).all();
console.log('\nFinal editor_items counts:');
counts.forEach(r => console.log(`  ${r.step1_status} / ${r.step2_status}: ${r.c}`));

db.close();