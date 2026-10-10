/**
 * Batch backfill prompt tags/categories with DeepSeek.
 *
 * Example:
 *   DEEPSEEK_API_KEY=your-api-key node scripts/llmTagBackfill.js --limit=100 --batch=10 --concurrency=10 --apply
 *   DEEPSEEK_API_KEY=your-api-key node scripts/llmTagBackfill.js --limit=100 --dry-run
 */

import {
  listPromptRowsForTagging,
  applyPromptTagging,
  countPromptRowsForTagging,
} from '../db/promptsRepo.js';
import { tagPromptsInParallel } from '../services/taggingService.js';

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

const limit = Number(arg('limit', 100));
const offset = Number(arg('offset', 0));
const batchSize = Number(arg('batch', 10));
const concurrency = Number(arg('concurrency', 10));
const includeTagged = process.argv.includes('--all');
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const category = arg('category', '');
const model = arg('model', process.env.DEEPSEEK_TAG_MODEL || 'deepseek-chat');

const candidates = listPromptRowsForTagging({
  limit,
  offset,
  includeTagged,
  category,
});

console.log(`[llmTagBackfill] candidates selected: ${candidates.length}`);
console.log(`[llmTagBackfill] total candidates in scope: ${countPromptRowsForTagging({ includeTagged, category })}`);
console.log(`[llmTagBackfill] mode: ${dryRun ? 'DRY RUN' : 'APPLY'}`);
console.log(`[llmTagBackfill] config: batch=${batchSize}, concurrency=${concurrency}, model=${model}`);

if (!candidates.length) {
  process.exit(0);
}

const tagged = await tagPromptsInParallel(candidates, {
  batchSize,
  concurrency,
  model,
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
});

let updated = 0;
if (!dryRun) {
  for (const row of tagged) {
    const saved = applyPromptTagging({
      promptId: row.id,
      category: row.category,
      tags: row.tags,
      source: 'llm',
      confidence: row.confidence,
    });
    if (saved) updated += 1;
  }
}

console.log(`[llmTagBackfill] tagged: ${tagged.length}, updated: ${updated}`);
for (const row of tagged.slice(0, 12)) {
  console.log(`- ${row.id} | ${row.category} | ${(row.tags || []).slice(0, 5).join(', ')}`);
}
