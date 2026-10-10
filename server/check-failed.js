import Database from 'better-sqlite3';
const db = new Database('./server/data/lovioa.db');
const failed = db.prepare(`
  SELECT gj.id, gj.status, gj.last_error, gj.reference_image_url, gj.prompt, gj.model, gj.mode
  FROM gen_jobs gj
  JOIN editor_items ei ON ei.step2_job_id = gj.id
  WHERE ei.step1_status = 'succeeded' AND gj.status = 'failed'
`).all();
console.log('Failed step2 jobs:', failed.length);
failed.forEach(j => {
  console.log('---');
  console.log('id:', j.id);
  console.log('mode:', j.mode);
  console.log('prompt:', j.prompt?.substring(0, 80));
  console.log('ref_url:', j.reference_image_url?.substring(0, 100));
  console.log('error:', j.last_error?.substring(0, 300));
});

// Also check running jobs
const running = db.prepare(`
  SELECT gj.id, gj.status, gj.reference_image_url, gj.prompt
  FROM gen_jobs gj
  JOIN editor_items ei ON ei.step2_job_id = gj.id
  WHERE ei.step1_status = 'succeeded' AND gj.status = 'running'
`).all();
console.log('\nRunning step2 jobs:', running.length);
running.forEach(j => {
  console.log('id:', j.id, 'ref:', j.reference_image_url?.substring(0,80));
});