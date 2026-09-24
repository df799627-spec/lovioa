#!/usr/bin/env node
/**
 * Repair prompt text drift across generation tables.
 *
 * Use cases:
 * 1) Fill empty prompt fields from linked gen_jobs/gen_history records.
 * 2) Replace a known placeholder prompt with the real linked prompt.
 *
 * Examples:
 *   node repairPromptTextFromGenerationChain.js
 *   node repairPromptTextFromGenerationChain.js --apply
 *   node repairPromptTextFromGenerationChain.js --apply --replace="A legendary sea serpent ..."
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, '../data/lovioa.db');

const apply = process.argv.includes('--apply');
const replaceArg = process.argv.find((v) => v.startsWith('--replace='));
const replaceText = replaceArg ? String(replaceArg.slice('--replace='.length) || '').trim() : '';

function normalizedText(v) {
  return String(v || '').trim();
}

function shouldRepair(current) {
  const cur = normalizedText(current);
  if (!cur) return true;
  if (replaceText && cur === replaceText) return true;
  return false;
}

function pickBestPrompt(...candidates) {
  for (const c of candidates) {
    const v = normalizedText(c);
    if (v) return v;
  }
  return '';
}

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

const historyRows = db.prepare(`
  SELECT
    h.id,
    h.prompt AS current_prompt,
    h.job_id,
    j.prompt AS job_prompt
  FROM gen_history h
  LEFT JOIN gen_jobs j ON j.id = h.job_id
`).all();

const generatedRows = db.prepare(`
  SELECT
    g.id,
    g.source_prompt AS current_prompt,
    g.gen_job_id,
    h.prompt AS history_prompt_by_id,
    h2.prompt AS history_prompt_by_job,
    j.prompt AS job_prompt
  FROM generated_images g
  LEFT JOIN gen_history h ON h.id = g.id
  LEFT JOIN gen_history h2 ON h2.job_id = g.gen_job_id
  LEFT JOIN gen_jobs j ON j.id = g.gen_job_id
`).all();

const promptRows = db.prepare(`
  SELECT
    p.id,
    p.prompt AS current_prompt,
    h.prompt AS history_prompt,
    j.prompt AS job_prompt
  FROM prompts p
  LEFT JOIN gen_history h ON p.id = ('gen-' || h.id)
  LEFT JOIN gen_jobs j ON j.id = h.job_id
  WHERE p.id LIKE 'gen-%'
`).all();

const historyUpdates = [];
for (const row of historyRows) {
  if (!shouldRepair(row.current_prompt)) continue;
  const next = pickBestPrompt(row.job_prompt);
  if (!next) continue;
  if (next === normalizedText(row.current_prompt)) continue;
  historyUpdates.push({ id: row.id, next });
}

const generatedUpdates = [];
for (const row of generatedRows) {
  if (!shouldRepair(row.current_prompt)) continue;
  const next = pickBestPrompt(row.history_prompt_by_id, row.history_prompt_by_job, row.job_prompt);
  if (!next) continue;
  if (next === normalizedText(row.current_prompt)) continue;
  generatedUpdates.push({ id: row.id, next });
}

const promptUpdates = [];
for (const row of promptRows) {
  if (!shouldRepair(row.current_prompt)) continue;
  const next = pickBestPrompt(row.history_prompt, row.job_prompt);
  if (!next) continue;
  if (next === normalizedText(row.current_prompt)) continue;
  promptUpdates.push({ id: row.id, next });
}

const summary = {
  mode: apply ? 'APPLY' : 'DRY_RUN',
  replaceTextEnabled: Boolean(replaceText),
  candidate: {
    gen_history: historyUpdates.length,
    generated_images: generatedUpdates.length,
    prompts: promptUpdates.length,
  },
};

console.log(JSON.stringify(summary, null, 2));

if (historyUpdates.length) {
  console.log('\n[preview] gen_history (first 5):');
  for (const row of historyUpdates.slice(0, 5)) {
    console.log(`- ${row.id} -> ${row.next.slice(0, 120)}`);
  }
}
if (generatedUpdates.length) {
  console.log('\n[preview] generated_images (first 5):');
  for (const row of generatedUpdates.slice(0, 5)) {
    console.log(`- ${row.id} -> ${row.next.slice(0, 120)}`);
  }
}
if (promptUpdates.length) {
  console.log('\n[preview] prompts (first 5):');
  for (const row of promptUpdates.slice(0, 5)) {
    console.log(`- ${row.id} -> ${row.next.slice(0, 120)}`);
  }
}

if (apply) {
  const updateHistory = db.prepare('UPDATE gen_history SET prompt = ? WHERE id = ?');
  const updateGenerated = db.prepare('UPDATE generated_images SET source_prompt = ? WHERE id = ?');
  const updatePrompt = db.prepare('UPDATE prompts SET prompt = ? WHERE id = ?');

  const tx = db.transaction(() => {
    for (const row of historyUpdates) updateHistory.run(row.next, row.id);
    for (const row of generatedUpdates) updateGenerated.run(row.next, row.id);
    for (const row of promptUpdates) updatePrompt.run(row.next, row.id);
  });
  tx();

  console.log('\n[apply] done:', {
    gen_history: historyUpdates.length,
    generated_images: generatedUpdates.length,
    prompts: promptUpdates.length,
  });
}

db.close();
