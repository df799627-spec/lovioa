import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, '..'));

const db = new Database('./server/data/lovioa.db');

const failed = db.prepare(`
  SELECT gj.id, gj.attempt_count, gj.reference_image_url
  FROM gen_jobs gj
  JOIN editor_items ei ON ei.step2_job_id = gj.id
  WHERE ei.step1_status = 'succeeded' AND gj.status = 'failed'
`).all();

console.log('Will reset', failed.length, 'failed step2 jobs:');
const update = db.prepare('UPDATE gen_jobs SET status = ?, last_error = NULL, attempt_count = 0 WHERE id = ?');
const tx = db.transaction(() => {
  for (const job of failed) {
    update.run('queued', job.id);
    console.log('  Reset:', job.id.substring(0, 8), '| ref:', job.reference_image_url?.substring(0, 60));
  }
});
tx();
console.log('Done.');
