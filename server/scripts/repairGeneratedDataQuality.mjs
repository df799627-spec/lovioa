#!/usr/bin/env node
/**
 * Repair real generation categories and remove duplicate public records.
 *
 * Usage:
 *   node server/scripts/repairGeneratedDataQuality.mjs
 *   node server/scripts/repairGeneratedDataQuality.mjs --apply
 *   node server/scripts/repairGeneratedDataQuality.mjs --apply --dedup
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  classifyPrompt,
  normalizeImageFingerprint,
  normalizePromptFingerprint,
} from '../services/promptTaxonomy.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, '../data/lovioa.db');
const apply = process.argv.includes('--apply');
const dedup = process.argv.includes('--dedup');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 15000');

function parseTags(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function classify(prompt) {
  const result = classifyPrompt(prompt || '');
  return {
    category: result.category,
    tagsJson: JSON.stringify(result.tags),
  };
}

const historyRows = db.prepare('SELECT id, prompt, category FROM gen_history').all();
const generatedRows = db.prepare('SELECT id, source_prompt, category, tags_json, image_url FROM generated_images').all();
const promptRows = db.prepare(`
  SELECT id, prompt, category, tags_json, image_url, created_at
  FROM prompts
  WHERE id LIKE 'gen-%'
`).all();

const historyUpdates = [];
for (const row of historyRows) {
  const next = classify(row.prompt);
  if (next.category !== row.category) historyUpdates.push({ id: row.id, ...next });
}

const generatedUpdates = [];
for (const row of generatedRows) {
  const next = classify(row.source_prompt);
  if (next.category !== row.category || JSON.stringify(parseTags(row.tags_json)) !== next.tagsJson) {
    generatedUpdates.push({ id: row.id, ...next });
  }
}

const promptUpdates = [];
for (const row of promptRows) {
  const next = classify(row.prompt);
  if (next.category !== row.category || JSON.stringify(parseTags(row.tags_json)) !== next.tagsJson) {
    promptUpdates.push({ id: row.id, ...next });
  }
}

function duplicateIds(rows, promptField) {
  const seenPrompt = new Set();
  const seenImage = new Set();
  const remove = [];
  for (const row of [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))) {
    const promptKey = normalizePromptFingerprint(row[promptField] || '');
    const imageKey = normalizeImageFingerprint(row.image_url || '');
    const duplicate = (promptKey && seenPrompt.has(promptKey)) || (imageKey && seenImage.has(imageKey));
    if (duplicate) {
      remove.push(row.id);
      continue;
    }
    if (promptKey) seenPrompt.add(promptKey);
    if (imageKey) seenImage.add(imageKey);
  }
  return remove;
}

const duplicatePromptIds = dedup ? duplicateIds(promptRows, 'prompt') : [];
const duplicateGeneratedIds = dedup ? duplicateIds(generatedRows, 'source_prompt') : [];

console.log(JSON.stringify({
  mode: apply ? 'APPLY' : 'DRY_RUN',
  dedup,
  totals: {
    gen_history: historyRows.length,
    generated_images: generatedRows.length,
    generated_prompts: promptRows.length,
  },
  category_updates: {
    gen_history: historyUpdates.length,
    generated_images: generatedUpdates.length,
    prompts: promptUpdates.length,
  },
  duplicate_public_rows: {
    prompts: duplicatePromptIds.length,
    generated_images: duplicateGeneratedIds.length,
  },
}, null, 2));

if (apply) {
  const updateHistory = db.prepare('UPDATE gen_history SET category = ? WHERE id = ?');
  const updateGenerated = db.prepare('UPDATE generated_images SET category = ?, tags_json = ? WHERE id = ?');
  const updatePrompt = db.prepare('UPDATE prompts SET category = ?, tags_json = ? WHERE id = ?');
  const deletePromptTags = db.prepare('DELETE FROM prompt_tags WHERE prompt_id = ?');
  const deletePrompt = db.prepare('DELETE FROM prompts WHERE id = ?');
  const deleteGenerated = db.prepare('DELETE FROM generated_images WHERE id = ?');

  const tx = db.transaction(() => {
    for (const row of historyUpdates) updateHistory.run(row.category, row.id);
    for (const row of generatedUpdates) updateGenerated.run(row.category, row.tagsJson, row.id);
    for (const row of promptUpdates) updatePrompt.run(row.category, row.tagsJson, row.id);
    for (const id of duplicatePromptIds) {
      deletePromptTags.run(id);
      deletePrompt.run(id);
    }
    for (const id of duplicateGeneratedIds) deleteGenerated.run(id);
  });
  tx();
  console.log('Applied data quality repair.');
}

const categoryCounts = db.prepare(`
  SELECT category, COUNT(*) AS count
  FROM gen_history
  GROUP BY category
  ORDER BY count DESC
`).all();
console.log('gen_history categories:', JSON.stringify(categoryCounts));
console.log('remaining generated prompts:', db.prepare("SELECT COUNT(*) AS count FROM prompts WHERE id LIKE 'gen-%'").get().count);

db.close();
