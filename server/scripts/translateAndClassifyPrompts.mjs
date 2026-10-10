#!/usr/bin/env node

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { CATEGORY_NAMES, inferCategoryAndTags } from '../services/promptTaxonomy.js';
import { getPromptTextConfig, translatePromptBatch } from '../services/promptTranslationService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, '../data/lovioa.db');
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 15000');

loadEnvFile(join(__dirname, '../../.env'));
loadEnvFile(join(__dirname, '../.env'));

const args = parseArgs(process.argv.slice(2));
const batchSize = Math.max(1, Number(args.batch || args['batch-size'] || 20));
const concurrency = Math.max(1, Number(args.concurrency || 5));
const limit = args.limit === undefined ? Infinity : Math.max(0, Number(args.limit));
const dryRun = Boolean(args['dry-run']);
const force = Boolean(args.force);

const SOURCES = [
  { table: 'prompts', promptColumn: 'prompt', zhColumn: 'prompt_zh', categoryColumn: 'category', tagsColumn: 'tags_json' },
  { table: 'gen_history', promptColumn: 'prompt', zhColumn: 'prompt_zh', categoryColumn: 'category', tagsColumn: 'tags_json' },
  { table: 'gen_jobs', promptColumn: 'prompt', zhColumn: 'prompt_zh', categoryColumn: 'category', tagsColumn: 'tags_json' },
  { table: 'generated_images', promptColumn: 'source_prompt', zhColumn: 'prompt_zh', categoryColumn: 'category', tagsColumn: 'tags_json' },
  { table: 'editor_items', promptColumn: 'prompt', zhColumn: 'prompt_zh', categoryColumn: 'category', tagsColumn: 'tags_json' },
];

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'dry-run' || key === 'force') result[key] = true;
    else result[key] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  }
  return result;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function ensureColumn(table, column, definition) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  if (!columns.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function safeParseTags(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function fingerprint(prompt) {
  return createHash('sha256')
    .update(String(prompt || '').toLowerCase().replace(/\s+/g, ' ').trim())
    .digest('hex');
}

function collectItems() {
  for (const source of SOURCES) {
    ensureColumn(source.table, source.zhColumn, `${source.zhColumn} TEXT NOT NULL DEFAULT ''`);
    if (source.table === 'gen_history' || source.table === 'gen_jobs') {
      ensureColumn(source.table, source.tagsColumn, `${source.tagsColumn} TEXT NOT NULL DEFAULT '[]'`);
    }
  }

  const items = [];
  for (const source of SOURCES) {
    const where = [`TRIM(COALESCE(${source.promptColumn}, '')) != ''`];
    if (!force) where.push(`TRIM(COALESCE(${source.zhColumn}, '')) = ''`);
    const rows = db.prepare(`
      SELECT id, ${source.promptColumn} AS prompt, ${source.zhColumn} AS prompt_zh,
             ${source.categoryColumn} AS category, ${source.tagsColumn} AS tags_json
      FROM ${source.table}
      WHERE ${where.join(' AND ')}
      ORDER BY id
    `).all();
    for (const row of rows) {
      items.push({
        source,
        id: String(row.id),
        prompt: String(row.prompt || '').trim(),
        promptZh: String(row.prompt_zh || '').trim(),
        category: String(row.category || '').trim(),
        tags: safeParseTags(row.tags_json),
      });
    }
  }
  return items.slice(0, limit);
}

function updateItem(item, result) {
  const category = CATEGORY_NAMES.includes(result.category)
    ? result.category
    : (inferCategoryAndTags(item.prompt).category || 'Generated');
  const tags = Array.isArray(result.tags) && result.tags.length
    ? result.tags.slice(0, 12)
    : inferCategoryAndTags(`${item.prompt} ${result.promptZh}`).tags;
  const source = item.source;
  db.prepare(`
    UPDATE ${source.table}
    SET ${source.zhColumn} = @promptZh,
        ${source.categoryColumn} = @category,
        ${source.tagsColumn} = @tagsJson
    WHERE id = @id
  `).run({
    id: item.id,
    promptZh: result.promptZh,
    category,
    tagsJson: JSON.stringify(tags),
  });
}

function persistResultForPrompt(result, items) {
  if (!result?.promptZh || !Array.isArray(items) || items.length === 0) return 0;
  const tx = db.transaction(() => {
    for (const item of items) updateItem(item, result);
  });
  tx();
  return items.length;
}

async function withRetry(task, label) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(1500 * (2 ** attempt));
    }
  }
  throw new Error(`${label}: ${lastError?.message || lastError}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = getPromptTextConfig();
  if (!config.apiKey) throw new Error('PROMPT_TEXT_API_KEY is missing');

  const allItems = collectItems();
  const byFingerprint = new Map();
  for (const item of allItems) {
    const key = fingerprint(item.prompt);
    if (!byFingerprint.has(key)) byFingerprint.set(key, []);
    byFingerprint.get(key).push(item);
  }
  const uniqueItems = [...byFingerprint.values()].map((rows) => rows[0]);
  const chunks = [];
  for (let i = 0; i < uniqueItems.length; i += batchSize) {
    chunks.push(uniqueItems.slice(i, i + batchSize));
  }

  console.log(JSON.stringify({
    mode: dryRun ? 'dry-run' : 'write-metadata-only',
    model: config.model,
    baseUrl: config.baseUrl,
    totalRecords: allItems.length,
    uniquePrompts: uniqueItems.length,
    batches: chunks.length,
    batchSize,
    concurrency,
    imageGeneration: false,
  }, null, 2));

  const resultsByFingerprint = new Map();
  let cursor = 0;
  let failedBatches = 0;
  let updatedRecords = 0;
  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
    while (cursor < chunks.length) {
      const index = cursor++;
      const chunk = chunks[index];
      try {
        const results = await withRetry(
          () => translatePromptBatch(chunk, config),
          `batch-${index + 1}`,
        );
        for (let i = 0; i < chunk.length; i += 1) {
          const item = chunk[i];
          const result = results[i];
          const key = fingerprint(item.prompt);
          if (result?.promptZh) {
            resultsByFingerprint.set(key, result);
            if (!dryRun) {
              updatedRecords += persistResultForPrompt(result, byFingerprint.get(key) || [item]);
            }
          }
        }
        console.log(`[translation] batch=${index + 1}/${chunks.length} records=${chunk.length}`);
      } catch (error) {
        failedBatches += 1;
        console.error(`[translation] batch=${index + 1} failed: ${error.message}`);
      }
    }
  });
  await Promise.all(workers);

  console.log(JSON.stringify({
    translatedUnique: resultsByFingerprint.size,
    updatedRecords,
    failedBatches,
    imageGeneration: false,
    englishPromptDeleted: false,
  }, null, 2));
  if (failedBatches > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[translation] fatal: ${error.message}`);
  process.exitCode = 1;
});
