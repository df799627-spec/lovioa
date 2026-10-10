/**
 * Repair script: syncs step1_status from gen_jobs to editor_items,
 * then triggers advanceEditorItemFromStep1 for any items where step1 succeeded
 * but step2 has not yet been enqueued.
 *
 * Usage: node server/repair-editor-items.js
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { advanceEditorItemFromStep1 } from './db/promptsRepo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.chdir(resolve(__dirname, '..'));
process.env.NODE_ENV = 'production';

const db = new Database('./server/data/lovioa.db');

console.log('=== Editor Items Repair Script ===\n');

// Step 1: Find all editor_items where step1_status='queued' but gen_jobs shows 'succeeded'
const stuck = db.prepare(`
  SELECT ei.id, ei.step1_job_id, ei.step1_status, ei.step2_status, ei.prompt
  FROM editor_items ei
  LEFT JOIN gen_jobs gj ON gj.id = ei.step1_job_id
  WHERE ei.step1_status = 'queued' AND gj.status = 'succeeded'
`).all();

console.log(`Found ${stuck.length} items with step1_status='queued' but gen_job succeeded:`);
stuck.forEach(item => {
  console.log(`  ${item.id} | step1_job=${item.step1_job_id?.substring(0,8)} | prompt="${item.prompt?.substring(0,50)}..."`);
});

// Step 2: For each stuck item, advance to step2
let advanced = 0, skipped = 0;
for (const item of stuck) {
  if (item.step2_status !== 'pending') {
    console.log(`  [SKIP] ${item.id} already has step2_status=${item.step2_status}`);
    skipped++;
    continue;
  }

  try {
    const job = db.prepare('SELECT result_image_url FROM gen_jobs WHERE id = ?').get(item.step1_job_id);
    if (!job?.result_image_url) {
      console.log(`  [SKIP] ${item.id} has no result_image_url`);
      skipped++;
      continue;
    }

    const result = advanceEditorItemFromStep1(item.step1_job_id, job.result_image_url);
    console.log(`  [OK] ${item.id} → step2_job=${result?.step2JobId?.substring(0,8) || '?'} (step2 enqueued)`);
    advanced++;
  } catch (err) {
    console.log(`  [ERROR] ${item.id} → ${err.message}`);
  }
}

console.log(`\nSummary: advanced=${advanced} skipped=${skipped}`);

// Step 3: Show current editor_items status
console.log('\n--- Current editor_items status ---');
const status = db.prepare(`
  SELECT step1_status, step2_status, COUNT(*) as cnt
  FROM editor_items GROUP BY step1_status, step2_status ORDER BY step1_status, step2_status
`).all();
status.forEach(r => console.log(`  step1=${r.step1_status} step2=${r.step2_status} count=${r.cnt}`));

// Step 4: Show step2 gen_jobs overview
console.log('\n--- Step2 gen_jobs status ---');
const step2Jobs = db.prepare(`
  SELECT gj.status, COUNT(*) as cnt
  FROM gen_jobs gj
  JOIN editor_items ei ON ei.step2_job_id = gj.id
  GROUP BY gj.status
`).all();
step2Jobs.forEach(r => console.log(`  status=${r.status} count=${r.cnt}`));

process.exit(0);