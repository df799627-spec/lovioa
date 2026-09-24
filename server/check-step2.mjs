import Database from 'better-sqlite3';
const db = new Database('./data/lovioa.db');

// Check all edit job statuses
const counts = db.prepare(`
  SELECT mode, status, COUNT(*) as c
  FROM gen_jobs WHERE mode='edit'
  GROUP BY mode, status ORDER BY 1,2
`).all();
console.log('Edit jobs by status:', JSON.stringify(counts));

// Check editor_items step2 status
const itemCounts = db.prepare(`
  SELECT step2_status, COUNT(*) as c
  FROM editor_items
  WHERE step1_status = 'succeeded'
  GROUP BY step2_status
`).all();
console.log('Editor items (step1=succeeded) by step2_status:', JSON.stringify(itemCounts));

// Check how many queued edit jobs exist
const q = db.prepare(`SELECT COUNT(*) as c FROM gen_jobs WHERE mode='edit' AND status='queued'`).get();
const r = db.prepare(`SELECT COUNT(*) as c FROM gen_jobs WHERE mode='edit' AND status='running'`).get();
const f = db.prepare(`SELECT COUNT(*) as c FROM gen_jobs WHERE mode='edit' AND status='failed'`).get();
console.log(`\ngen_jobs (edit mode): queued=${q.c} running=${r.c} failed=${f.c}`);