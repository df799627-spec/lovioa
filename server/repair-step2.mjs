/**
 * Repair stuck step2 jobs for editor_items.
 *
 * Problem: 290 items have step1=succeeded but step2=failed because the
 * reference image was stored as base64 data URI in result_base_url, and
 * localUrlToBase64() timed out during the 180s job window.
 *
 * Fix: Re-enqueue step2 with the same baseImageUrl (the base64 data URI
 * still exists in editor_items.result_base_url). The new step2 job will
 * run with its own independent 120s image-load timeout.
 *
 * Usage: node repair-step2.mjs [--dry-run]
 */

import Database from 'better-sqlite3';
import { enqueueGenJob } from './db/promptsRepo.js';

const db = new Database('./data/lovioa.db');
const dryRun = process.argv.includes('--dry-run');

console.log(`Running repair in ${dryRun ? 'DRY-RUN' : 'LIVE'} mode\n`);

// Find items where step1 succeeded but step2 failed (with valid base image)
const stuckItems = db.prepare(`
  SELECT id, step1_job_id, step2_job_id, result_base_url,
         prompt, edit_instruction, category, tags_json
  FROM editor_items
  WHERE step1_status = 'succeeded'
    AND step2_status = 'failed'
    AND result_base_url IS NOT NULL
    AND result_base_url != ''
  ORDER BY created_at DESC
`).all();

console.log(`Found ${stuckItems.length} stuck items to repair\n`);

if (dryRun) {
  console.log('Dry run - would enqueue step2 for:');
  for (const item of stuckItems) {
    console.log(`  ${item.id.slice(0,8)} step2=${item.step2_job_id?.slice(0,8)} base_url=${item.result_base_url.slice(0,60)}`);
  }
  process.exit(0);
}

let enqueued = 0;
const now = Date.now();

for (const item of stuckItems) {
  const baseImageUrl = item.result_base_url;
  if (!baseImageUrl) {
    console.log(`  [SKIP] ${item.id.slice(0,8)} - no result_base_url`);
    continue;
  }

  // Check if there's already a non-failed step2 job queued for this item
  // (step2_job_id may point to an exhausted failed job, but step2_status='queued'
  // means a newer job has been enqueued)
  if (item.step2_status === 'queued') {
    console.log(`  [SKIP] ${item.id.slice(0,8)} - step2 already queued`);
    continue;
  }

  // Enqueue new step2 job with the base image
  // Use the same parameters as advanceEditorItemFromStep1
  const step2Job = enqueueGenJob({
    userId: null,
    mode: 'edit',
    model: process.env.VITE_OPENAI_IMAGE_MODEL || 'gpt-image-2',
    size: '1024x1024',
    quality: 'hd',
    prompt: item.edit_instruction || '',
    editStrength: 0.65,
    referenceImageUrl: baseImageUrl,
    maxAttempts: 2,
    publishToPrompts: false,
    initialStatus: 'queued',
    isHeartbeat: true,
    heartbeatKind: 'editor_showcase',
    heartbeatCategory: item.category || '',
  });

  // Update editor_items to track new step2
  db.prepare(`
    UPDATE editor_items
    SET step2_status = 'queued',
        step2_job_id = ?,
        updated_at = ?
    WHERE id = ?
  `).run(step2Job?.id || null, new Date().toISOString(), item.id);

  console.log(`  [OK] ${item.id.slice(0,8)} new_step2=${step2Job?.id?.slice(0,8)}`);
  enqueued++;
}

console.log(`\nEnqueued ${enqueued} new step2 jobs`);