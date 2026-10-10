import Database from 'better-sqlite3';
const db = new Database('./data/lovioa.db');

const rows = db.prepare(`
  SELECT gj.id, gj.mode, gj.result_image_url, gj.status, ei.step1_status
  FROM editor_items ei
  JOIN gen_jobs gj ON gj.id = ei.step1_job_id
  WHERE ei.step1_status = 'succeeded' AND gj.result_image_url IS NOT NULL
  LIMIT 5
`).all();
console.log('Step1 success URLs:');
for (const r of rows) {
  console.log(`  job=${r.id.slice(0,8)} mode=${r.mode} status=${r.status}`);
  console.log(`  URL: ${r.result_image_url?.slice(0,120)}`);
}
console.log();

const step2fails = db.prepare(`
  SELECT gj.id, gj.reference_image_url, gj.last_error
  FROM gen_jobs gj
  JOIN editor_items ei ON ei.step2_job_id = gj.id
  WHERE ei.step1_status = 'succeeded' AND gj.status = 'failed'
  LIMIT 3
`).all();
console.log('Step2 failures:');
for (const r of step2fails) {
  console.log(`  job=${r.id.slice(0,8)}`);
  console.log(`  ref=${r.reference_image_url?.slice(0,120)}`);
  console.log(`  err=${r.last_error?.slice(0,100)}`);
}