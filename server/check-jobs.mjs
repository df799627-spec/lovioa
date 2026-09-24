import Database from 'better-sqlite3';
const db = new Database('./data/lovioa.db');

const counts = db.prepare(`
  SELECT mode, status, COUNT(*) as c
  FROM gen_jobs
  GROUP BY mode, status
  ORDER BY 1,2
`).all();
console.log('All jobs by mode/status:', JSON.stringify(counts, null, 2));

const queuedByMode = db.prepare(`
  SELECT mode, COUNT(*) as c FROM gen_jobs WHERE status='queued' GROUP BY mode
`).all();
console.log('Queued by mode:', JSON.stringify(queuedByMode));

// Also check the 514 failed edit jobs — how many are truly exhausted (attempt_count >= max_attempts)?
const exhaustedEdit = db.prepare(`
  SELECT COUNT(*) as c FROM gen_jobs
  WHERE mode='edit' AND status='failed'
    AND attempt_count >= max_attempts
`).get();
const retryableEdit = db.prepare(`
  SELECT COUNT(*) as c FROM gen_jobs
  WHERE mode='edit' AND status='failed'
    AND attempt_count < max_attempts
`).get();
console.log(`Failed edit jobs: exhausted=${exhaustedEdit.c} retryable=${retryableEdit.c}`);