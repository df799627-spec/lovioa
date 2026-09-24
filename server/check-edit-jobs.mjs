import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const dbPath = fileURLToPath(new URL('./data/lovioa.db', import.meta.url));
const db = new Database(dbPath);

const failed = db.prepare(`
  SELECT id, mode, status, attempt_count, max_attempts, last_error, updated_at
  FROM gen_jobs
  WHERE mode='edit' AND status='failed'
  ORDER BY updated_at DESC
  LIMIT 10
`).all();
console.log('Recent failed edit jobs:', JSON.stringify(failed, null, 2));

const queued = db.prepare(`
  SELECT id, mode, status, attempt_count, updated_at
  FROM gen_jobs
  WHERE mode='edit' AND status='queued'
  ORDER BY updated_at ASC
  LIMIT 5
`).all();
console.log('Queued edit jobs:', JSON.stringify(queued, null, 2));

const running = db.prepare(`
  SELECT id, mode, status, attempt_count, updated_at
  FROM gen_jobs
  WHERE mode='edit' AND status='running'
  ORDER BY updated_at ASC
  LIMIT 5
`).all();
console.log('Running edit jobs:', JSON.stringify(running, null, 2));
