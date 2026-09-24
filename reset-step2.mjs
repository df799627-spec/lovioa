import Database from 'better-sqlite3';
const db = new Database('./server/data/lovioa.db');
const reset = db.prepare(`
  UPDATE gen_jobs
  SET status = 'queued', attempt_count = 0, last_error = NULL,
      next_retry_at = NULL, finished_at = NULL, started_at = NULL
  WHERE id IN (
    SELECT gj.id FROM gen_jobs gj
    JOIN editor_items ei ON ei.step2_job_id = gj.id
    WHERE ei.step1_status = 'succeeded' AND gj.status IN ('failed','queued')
  )
`).run();
console.log('Reset:', reset.changes);
