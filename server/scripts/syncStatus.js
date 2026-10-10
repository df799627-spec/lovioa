import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, '../data/lovioa.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS gen_history_remote_sync (
    history_id TEXT PRIMARY KEY,
    remote_job_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    synced_at TEXT,
    updated_at TEXT NOT NULL
  );
`);

const counts = {
  historyApproved: db.prepare("SELECT COUNT(1) AS c FROM gen_history WHERE moderation_status = 'approved'").get().c,
  syncSucceeded: db.prepare("SELECT COUNT(1) AS c FROM gen_history_remote_sync WHERE status = 'succeeded'").get().c,
  syncPending: db.prepare("SELECT COUNT(1) AS c FROM gen_history_remote_sync WHERE status = 'pending'").get().c,
  syncFailed: db.prepare("SELECT COUNT(1) AS c FROM gen_history_remote_sync WHERE status = 'failed'").get().c,
};

const unsynced = db.prepare(`
  SELECT COUNT(1) AS c
  FROM gen_history gh
  LEFT JOIN gen_history_remote_sync rs ON rs.history_id = gh.id
  WHERE gh.moderation_status = 'approved'
    AND (rs.status IS NULL OR rs.status <> 'succeeded')
`).get().c;

console.log(JSON.stringify({ ...counts, unsynced }, null, 2));

const recentFailed = db.prepare(`
  SELECT history_id, attempts, substr(last_error,1,140) AS last_error, updated_at
  FROM gen_history_remote_sync
  WHERE status = 'failed'
  ORDER BY updated_at DESC
  LIMIT 10
`).all();

if (recentFailed.length) {
  console.log('\nrecent_failed:');
  for (const row of recentFailed) {
    console.log(`${row.updated_at}\t${row.history_id}\tattempts=${row.attempts}\t${row.last_error}`);
  }
}

db.close();

