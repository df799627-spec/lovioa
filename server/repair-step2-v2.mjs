import Database from 'better-sqlite3';
const db = new Database('./data/lovioa.db');

console.log('=== Re-repair step2 failed items (v2: reset existing jobs) ===\n');

// Find step2 items that failed with exhausted attempts and have a base64 image
const toRepair = db.prepare(`
  SELECT ei.id, ei.step2_job_id, ei.result_base_url, ei.category, ei.tags_json,
         gj.attempt_count, gj.max_attempts, gj.last_error, gj.reference_image_url
  FROM editor_items ei
  JOIN gen_jobs gj ON gj.id = ei.step2_job_id
  WHERE ei.step1_status = 'succeeded'
    AND ei.step2_status = 'failed'
    AND gj.attempt_count >= gj.max_attempts
    AND ei.result_base_url IS NOT NULL
    AND ei.result_base_url != ''
  ORDER BY ei.updated_at DESC
`).all();

console.log(`Found ${toRepair.length} step2 items to re-repair\n`);

// We need to restore the reference_image_url in the job since step1 succeeded with base64 data
// The step2 job's reference_image_url might be stale or gone
// We use the editor_item's result_base_url (base64 from step1) as the reference_image_url

for (const item of toRepair) {
  // Restore reference_image_url from step1 base64 (in case it was cleared)
  db.prepare(`
    UPDATE gen_jobs
    SET status = 'queued',
        attempt_count = 0,
        max_attempts = 5,
        last_error = NULL,
        reference_image_url = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(item.result_base_url, item.step2_job_id);

  // Reset editor_items step2_status to queued
  db.prepare(`
    UPDATE editor_items
    SET step2_status = 'queued', updated_at = datetime('now')
    WHERE id = ?
  `).run(item.id);

  console.log(`  Re-repaired: item=${item.id.slice(0,8)}, job=${item.step2_job_id.slice(0,8)}`);
}

console.log(`\nRepaired ${toRepair.length} items`);

// Verify
const after = db.prepare(`
  SELECT step2_status, COUNT(*) as c
  FROM editor_items
  WHERE step1_status = 'succeeded'
  GROUP BY step2_status
`).all();
console.log('After repair:', JSON.stringify(after));

// Also check queued step2 jobs
const queued = db.prepare(`
  SELECT COUNT(*) as c
  FROM gen_jobs gj
  JOIN editor_items ei ON ei.step2_job_id = gj.id
  WHERE ei.step1_status = 'succeeded' AND ei.step2_status = 'queued'
  AND gj.mode = 'edit' AND gj.status = 'queued'
`).get();
console.log('Step2 jobs (edit, queued) for step1=succeeded:', queued.c);

db.close();