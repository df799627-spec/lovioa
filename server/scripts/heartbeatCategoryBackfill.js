/**
 * Manual trigger for low-stock category backfill workflow.
 *
 * Flow:
 * 1) Find categories with low inventory.
 * 2) Use DeepSeek to generate prompts with category quota.
 * 3) Batch enqueue generation jobs with heartbeat metadata.
 *
 * Example:
 *   DEEPSEEK_API_KEY=your-api-key node scripts/heartbeatCategoryBackfill.js --batch=120 --target=160 --categories=8
 */

import { startHeartbeatWorker } from '../services/heartbeatWorker.js';

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

const batchSize = Number(arg('batch', 120));
const targetPerCategory = Number(arg('target', 160));
const maxCategories = Number(arg('categories', 8));
const kind = String(arg('kind', 'category_backfill'));

const deepseekApiKey = (process.env.HEARTBEAT_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim();
const deepseekBaseUrl = (process.env.HEARTBEAT_DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').trim();
const deepseekModel = (process.env.HEARTBEAT_DEEPSEEK_MODEL || process.env.DEEPSEEK_TAG_MODEL || 'deepseek-chat').trim();

const worker = startHeartbeatWorker({
  enabled: false,
  batchSize,
  categoryTarget: targetPerCategory,
  maxBackfillCategories: maxCategories,
  deepseekApiKey,
  deepseekBaseUrl,
  deepseekModel,
  defaultModel: process.env.VITE_OPENAI_IMAGE_MODEL || 'gpt-image-2',
  defaultSize: process.env.VITE_OPENAI_IMAGE_SIZE || '1024x1024',
  defaultQuality: process.env.GEN_DEFAULT_QUALITY || 'medium',
  fastChannelsRaw: process.env.GEN_FAST_CHANNELS || '',
  channelDistributionRaw: process.env.HEARTBEAT_CHANNEL_DISTRIBUTION || '',
  logger: console,
});

try {
  const run = await worker.triggerOnce(kind, {
    mode: 'low_stock_backfill',
    batchSize,
    targetPerCategory,
    maxCategories,
  });
  if (!run) {
    console.log('[heartbeatCategoryBackfill] skipped: an active heartbeat run is already in progress');
    process.exit(0);
  }
  console.log('[heartbeatCategoryBackfill] run created:', run.id);
  console.log('[heartbeatCategoryBackfill] status:', run.status);
  console.log('[heartbeatCategoryBackfill] plannedJobs:', run.plannedJobs);
  console.log('[heartbeatCategoryBackfill] queuedJobs:', run.queuedJobs);
  console.log('[heartbeatCategoryBackfill] generatedCategories:', (run.generatedCategories || []).join(', '));
  if (run.details) {
    console.log('[heartbeatCategoryBackfill] details:', JSON.stringify(run.details));
  }
} finally {
  worker.stop();
  await worker.wait();
}
