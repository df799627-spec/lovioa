import Database from 'better-sqlite3';
const db = new Database('./data/lovioa.db');

const items = db.prepare(`
  SELECT ei.id, ei.step1_job_id, ei.step2_job_id, ei.step1_status, ei.step2_status, ei.published_to_prompts,
         gj1.status as step1_job_status, gj1.result_image_url as step1_url,
         gj2.status as step2_job_status, gj2.result_image_url as step2_url, gj2.last_error as step2_error
  FROM editor_items ei
  LEFT JOIN gen_jobs gj1 ON gj1.id = ei.step1_job_id
  LEFT JOIN gen_jobs gj2 ON gj2.id = ei.step2_job_id
  ORDER BY ei.created_at DESC
  LIMIT 20
`).all();

console.log('Total items:', items.length);
for (const item of items) {
  console.log('---');
  console.log('  step1:', item.step1_job_id?.slice(0,8), 'status=', item.step1_status, 'gj=', item.step1_job_status, 'url=', item.step1_url ? 'yes' : 'no');
  console.log('  step2:', item.step2_job_id?.slice(0,8), 'status=', item.step2_status, 'gj=', item.step2_job_status);
  console.log('  step2_url:', item.step2_url ? item.step2_url.slice(0,80) : 'null');
  console.log('  step2_err:', item.step2_error ? item.step2_error.slice(0,100) : 'null');
  console.log('  published:', item.published_to_prompts);
}