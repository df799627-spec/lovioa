/**
 * Editor Batch Worker
 *
 * 自动批量生成「提示词 + 样图 + 编辑图」三元组，展示在平台 Gallery。
 *
 * 流程：
 *   1. DeepSeek 并发生成 N 组 {prompt, editInstruction, category, tags}
 *   2. 每组入队 step1 gen_job (mode=text) — 生成样图
 *   3. genQueueWorker 处理 step1，完成后自动 advanceEditorItemFromStep1 → 入队 step2 (mode=edit)
 *   4. step2 完成后 advanceEditorItemFromStep2 → 发布到 prompts 表
 *
 * 启动方式（server/index.js）：
 *   const editorBatchWorker = startEditorBatchWorker({ ... });
 *   editorBatchWorker.triggerOnce()  // 手动触发一次
 */

import { createEditorBatch, touchEditorBatch, enqueueEditorItem } from '../db/promptsRepo.js';

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_CATEGORY_POOL = [
  'Portrait', 'Landscape', 'Fashion', 'Editorial', 'Abstract', 'Street',
  'UIDesign', 'Gaming', 'Architecture', 'Ecommerce', 'Food', 'Travel',
  'Illustration', 'SocialMedia', 'Avatar', 'Brand',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function parseChannels(raw) {
  if (!String(raw || '').trim()) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((ch) => ({
        name: String(ch?.name || '').trim(),
        enabled: ch?.enabled === undefined ? true : Boolean(ch.enabled),
      }))
      .filter((ch) => ch.name && ch.enabled);
  } catch {
    return [];
  }
}

/**
 * DeepSeek 生成 prompt + editInstruction 对
 */
async function generateEditorItemsWithDeepSeek({
  apiKey,
  baseUrl = DEFAULT_DEEPSEEK_BASE_URL,
  model = DEFAULT_DEEPSEEK_MODEL,
  categories = [],
  count = 12,
  logger = console,
}) {
  if (!apiKey) throw new Error('Editor batch: DeepSeek API key not configured');
  const normalizedCount = Math.max(1, Number(count || 12));
  const cats = (Array.isArray(categories) && categories.length > 0)
    ? categories
    : DEFAULT_CATEGORY_POOL.slice(0, 6);

  const systemPrompt = `You are a professional AI photography prompt engineer.
You output STRICT JSON only — no explanation, no markdown, no preamble.

Generate ${normalizedCount} unique English image prompt + edit instruction pairs for a gallery showcase.
Each item must include:
1. prompt: A detailed AI image generation prompt (15-40 words) including subject, lighting, composition, style, camera settings, mood — in English.
2. editInstruction: A concise editing instruction (1-2 sentences) describing how to modify the base image — action-oriented (e.g., "add a golden ornate frame", "replace background with a misty mountain at golden hour", "add cinematic lens flare and bokeh").
3. category: One category from: ${cats.join(', ')}.
4. tags: 3-6 lowercase keyword tokens related to the image.

Return strict JSON:
{"items":[{"prompt":"...","editInstruction":"...","category":"...","tags":["..."]}]}

Rules:
- No NSFW, no banned content
- Prompt must be vivid and detailed
- editInstruction must be specific and actionable
- category must be from the allowed list`;

  const userPrompt = `Generate ${normalizedCount} image prompt + edit instruction pairs for AI photography showcase.
Category pool: ${cats.join(', ')}
Format: strict JSON array {"items":[...]}`;

  const url = String(baseUrl).replace(/\/+$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: 2400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const payload = safeJson(text);
  const content = String(payload?.choices?.[0]?.message?.content || '').trim();
  const parsed = safeJson(content) || safeJson(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
  const rows = Array.isArray(parsed?.items) ? parsed.items : [];

  const validRows = rows
    .map((row) => ({
      prompt: String(row?.prompt || '').trim(),
      editInstruction: String(row?.editInstruction || row?.edit_instruction || '').trim(),
      category: String(row?.category || '').trim(),
      tags: Array.isArray(row?.tags) ? row.tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean).slice(0, 8) : [],
    }))
    .filter((row) => row.prompt.length >= 10 && row.editInstruction.length >= 5)
    .map((row, idx) => {
      if (!cats.includes(row.category)) {
        row.category = cats[idx % cats.length];
      }
      return row;
    });

  if (validRows.length === 0) {
    logger.warn('[editor-batch] deepseek returned no valid items, using fallback');
    return fallbackEditorItems({ categories: cats, count: normalizedCount });
  }

  return validRows.slice(0, normalizedCount);
}

function fallbackEditorItems({ categories = [], count = 12 } = {}) {
  const cats = Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_CATEGORY_POOL;
  const output = [];
  for (let i = 0; i < count; i++) {
    const cat = cats[i % cats.length];
    output.push({
      prompt: `Cinematic ${cat.toLowerCase()} photography, soft natural lighting, professional camera settings, high-end editorial quality, test sample ${i + 1}`,
      editInstruction: `Enhance with cinematic color grading, add subtle bokeh effect and golden light rays for a premium look`,
      category: cat,
      tags: ['editorial', cat.toLowerCase(), 'cinematic', 'ai-demo'],
    });
  }
  return output;
}

export function startEditorBatchWorker({
  deepseekApiKey = '',
  deepseekBaseUrl = DEFAULT_DEEPSEEK_BASE_URL,
  deepseekModel = DEFAULT_DEEPSEEK_MODEL,
  defaultModel = 'gpt-image-2',
  defaultSize = '1024x1024',
  defaultQuality = 'hd',
  fastChannelsRaw = '',
  enabled = false,
  intervalMs = 30 * 60 * 1000,   // default 30 minutes
  batchSize = 12,
  logger = console,
} = {}) {
  let stopped = false;
  let running = false;

  const knownChannels = parseChannels(fastChannelsRaw);

  function buildChannelPlan(total) {
    const names = knownChannels.map((c) => c.name);
    if (names.length === 0) return [];
    const out = [];
    for (let i = 0; i < total; i++) out.push(names[i % names.length]);
    return out;
  }

  async function runOnce(options = {}) {
    if (running) {
      logger.info('[editor-batch] run skipped: previous still active');
      return null;
    }
    running = true;
    const size = normalizePositiveInt(options.batchSize, normalizePositiveInt(batchSize, 12));
    const now = new Date().toISOString();

    try {
      logger.info(`[editor-batch] starting run, size=${size}`);

      // Step 1: Create batch record
      const batch = createEditorBatch({
        kind: 'editor_showcase',
        plannedCount: size,
        details: { deepseekModel, size, startedAt: now },
      });
      logger.info(`[editor-batch] created batch ${batch.id}`);

      // Step 2: Generate prompt + editInstruction pairs via DeepSeek
      let generated = [];
      try {
        generated = await generateEditorItemsWithDeepSeek({
          apiKey: deepseekApiKey,
          baseUrl: deepseekBaseUrl,
          model: deepseekModel,
          categories: DEFAULT_CATEGORY_POOL,
          count: size,
          logger,
        });
      } catch (err) {
        logger.warn(`[editor-batch] deepseek generation failed: ${err?.message || err}`);
      }

      if (generated.length === 0) {
        generated = fallbackEditorItems({ count: size });
      }

      // Step 3: Enqueue step1 gen_job for each item
      const channelPlan = buildChannelPlan(generated.length);
      let queued = 0;

      for (let i = 0; i < generated.length; i++) {
        const row = generated[i];
        const preferredChannel = channelPlan[i] || '';

        try {
          const item = enqueueEditorItem({
            prompt: row.prompt,
            editInstruction: row.editInstruction,
            category: row.category || 'Abstract',
            tags: row.tags || [],
            batchId: batch.id,
          });
          if (item?.id) queued += 1;
        } catch (err) {
          logger.warn(`[editor-batch] enqueueEditorItem failed: ${err?.message || err}`);
        }
      }

      // Step 4: Update batch queued count
      touchEditorBatch(batch.id, {
        queuedCount: queued,
        details: {
          ...batch.details,
          generatedSample: generated.slice(0, 5),
          queued,
          finishedAt: new Date().toISOString(),
        },
      });

      logger.info(`[editor-batch] batch=${batch.id} queued=${queued}`);
      return batch;
    } catch (err) {
      logger.error('[editor-batch] run error:', err);
      return null;
    } finally {
      running = false;
    }
  }

  async function loop() {
    while (!stopped) {
      if (!enabled) {
        await sleep(5000);
        continue;
      }
      try {
        await runOnce();
      } catch (err) {
        logger.error('[editor-batch] loop error:', err);
      }
      await sleep(Math.max(30_000, Number(intervalMs || 1_800_000)));
    }
    logger.info('[editor-batch] worker stopped');
  }

  const waitPromise = loop();

  return {
    /**
     * Manually trigger a batch run (e.g., from admin panel or on startup).
     * Can pass { batchSize: N } to override default.
     */
    async triggerOnce(options = {}) {
      if (running) {
        logger.info('[editor-batch] triggerOnce skipped: run already in progress');
        return null;
      }
      return runOnce(options || {});
    },

    stop() {
      stopped = true;
    },

    async wait() {
      try { await waitPromise; } catch {}
    },
  };
}