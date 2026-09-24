#!/usr/bin/env node
/**
 * DeepSeek Prompt Generator + Enqueuer
 *
 * 流程：
 *   1. 给出分类 → DeepSeek 并发生成 10 组提示词（每组 10 条）
 *   2. 发散去重 + 多样性注入
 *   3. 入队到 gen_jobs 表
 *
 * 使用方式：
 *   node deepseek-prompt-workflow.js                        # 默认：10并发 × 10条 × 10轮
 *   node deepseek-prompt-workflow.js --rounds 5             # 5轮（50条）
 *   node deepseek-prompt-workflow.js --batch 5 --rounds 3   # 3并发 × 5条 × 3轮（45条）
 *   node deepseek-prompt-workflow.js --dry-run             # 预览，不入队
 *   node deepseek-prompt-workflow.js --dedup-only          # 仅去重已有队列
 */

import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

// 复用 repo 里的 enqueueGenJob（列定义和默认值都正确）
const { enqueueGenJob } = await import('./db/promptsRepo.js');

// ─── CLI Args ──────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const CONCURRENCY     = args.batch     ?? 10;   // 同时发几个 DeepSeek 请求
const BATCH_SIZE      = args.size      ?? 10;   // 每个请求生成多少条
const ROUNDS          = args.rounds    ?? 1;    // 几轮
const DRY_RUN         = args['dry-run'] ?? false;
const DEDUP_ONLY      = args['dedup-only'] ?? false;
const CATEGORY_MODE   = args['categories'] ?? '';  // 逗号分隔，空=自动

// ─── Env ───────────────────────────────────────────────────────────────────
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.HEARTBEAT_DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL
  || process.env.HEARTBEAT_DEEPSEEK_BASE_URL
  || 'https://api.deepseek.com/v1';
const DEEPSEEK_MODEL = process.env.HEARTBEAT_DEEPSEEK_MODEL || 'deepseek-chat';

// ─── Default Taxonomy ───────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  'Portrait', 'Landscape', 'Fashion', 'Editorial', 'Abstract', 'Street',
  'UIDesign', 'Gaming', 'Architecture', 'Ecommerce', 'Food', 'Travel',
  'Illustration', 'SocialMedia', 'Avatar', 'Brand',
];

// ─── Diversity Seeds ───────────────────────────────────────────────────────
const SUBJECTS = [
  'a person', 'a group of people', 'a scene', 'an object', 'an abstract form',
  'a silhouette', 'a close-up', 'a wide establishing shot', 'a reflection', 'a shadow',
];
const LIGHTING = [
  'golden hour', 'blue hour', 'soft diffused', 'hard rim light', 'chiaroscuro',
  'neon glow', 'overcast', 'candlelight', 'fluorescent', 'starlight',
];
const CAMERAS = [
  'Leica M11', 'Hasselblad 503cx', 'Sony A7R V', 'Canon RF 85mm', 'Phase One',
  'Fujifilm GFX 100', 'Nikon Z9', 'iPhone 15 Pro', 'ARRI Alexa Mini', 'RED Komodo',
];
const MOODS = [
  'melancholic', 'joyful', 'mysterious', 'nostalgic', 'ethereal',
  'powerful', 'peaceful', 'chaotic', 'intimate', 'epic',
];
const STYLES = [
  'cinematic', 'documentary', 'editorial', 'fine art', 'fashion',
  'photojournalism', 'surreal', 'vintage film', 'hyperrealistic', 'minimalist',
];

// ─── Helpers ───────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms, ms)); }

function sha256(str) {
  return createHash('sha256').update(str.toLowerCase().trim()).digest('hex').slice(0, 16);
}

function normalizeCsvSet(value) {
  return new Set(String(value || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
}

function safeJson(text) {
  try { return JSON.parse(text); } catch {}
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch {}
  }
  return null;
}

function pickRandom(arr, seed) {
  // Deterministic pseudo-random using seed string
  const idx = Math.abs(sha256(seed).charCodeAt(0) + sha256(seed).charCodeAt(1)) % arr.length;
  return arr[idx];
}

function buildDiversityContext(round, batchIdx, itemIdx) {
  // 每个请求注入不同的种子，防止生成重复
  const seed = `${Date.now()}-${round}-${batchIdx}-${itemIdx}`;
  return {
    subject: pickRandom(SUBJECTS, seed + 's'),
    lighting: pickRandom(LIGHTING, seed + 'l'),
    camera: pickRandom(CAMERAS, seed + 'c'),
    mood: pickRandom(MOODS, seed + 'm'),
    style: pickRandom(STYLES, seed + 't'),
    variation: itemIdx % 5,  // 0-4 变化：构图/角度/氛围/光线/景深
  };
}

// ─── Dedup Logic ───────────────────────────────────────────────────────────
function loadExistingPrompts() {
  const existing = new Set();

  const jobs = db.prepare("SELECT prompt FROM gen_jobs WHERE status NOT IN ('failed', 'cancelled')").all();
  for (const r of jobs) existing.add(sha256(r.prompt));

  const hist = db.prepare("SELECT prompt FROM gen_history").all();
  for (const r of hist) existing.add(sha256(r.prompt));

  const prompts = db.prepare("SELECT prompt FROM prompts").all();
  for (const r of prompts) existing.add(sha256(r.prompt));

  return existing;
}

function isDuplicate(prompt, existingSet) {
  return existingSet.has(sha256(prompt));
}

function dedupPrompts(prompts, existingSet) {
  const unique = [];
  const dupes = [];
  for (const p of prompts) {
    if (isDuplicate(p.prompt, existingSet)) {
      dupes.push(p);
    } else {
      unique.push(p);
      existingSet.add(sha256(p.prompt)); // 加入集合，防止本轮内部重复
    }
  }
  return { unique, dupes };
}

// ─── DeepSeek Call ─────────────────────────────────────────────────────────
async function callDeepSeek({ categories, count = 10, round, batchIdx, signal }) {
  const baseUrl = DEEPSEEK_BASE_URL.replace(/\/+$/, '');
  const diverseCtx = buildDiversityContext(round, batchIdx, 0);

  const allowedCategories = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  const catHint = categories.length > 0 ? categories.join(', ') : allowedCategories.slice(0, 8).join(', ');

  // 多样性：让 DeepSeek 在不同的摄影子域中探索
  const userPrompt = [
    'Generate strict JSON only. No additional text.',
    `Generate ${count} unique English image prompts for AI generation stability testing.`,
    `Categories to cover: ${catHint}`,
    '',
    'IMPORTANT DIVERSITY RULES:',
    `- Vary the subject: person vs object vs scene vs abstract`,
    `- Vary the lighting: ${LIGHTING.join(', ')}`,
    `- Vary the mood: ${MOODS.join(', ')}`,
    `- Vary the style: ${STYLES.join(', ')}`,
    `- Vary the camera/lens: ${CAMERAS.join(', ')}`,
    '- Do NOT repeat the same subject-lighting-mood combo across items',
    '- Each prompt must feel like it could be from a different photographer',
    '',
    `Format: {"items":[{"prompt":"...","category":"...","tags":["..."]}]}`,
    'Rules:',
    `- prompt: 15-45 words, vivid, photographic, no banned words`,
    `- category: one of [${allowedCategories.join(', ')}]`,
    '- tags: 3-6 lowercase tokens',
    `- output exactly ${count} items`,
  ].join('\n');

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.85,   // 高温度增加多样性
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a professional AI photography prompt engineer. You output ONLY valid JSON. You generate highly diverse prompts across different subjects, lighting, moods, and styles. Never repeat similar combinations.'
        },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  const payload = safeJson(text);
  const content = payload?.choices?.[0]?.message?.content || '';
  const parsed = safeJson(content);

  if (!parsed || !Array.isArray(parsed?.items)) {
    // 尝试从内容中提取
    const items = parsed?.results ?? parsed?.prompts ?? parsed?.data ?? [];
    if (!Array.isArray(items)) {
      throw new Error(`DeepSeek returned invalid JSON: ${content.slice(0, 200)}`);
    }
    return items;
  }

  return parsed.items;
}

// ─── Enqueue ───────────────────────────────────────────────────────────────
function enqueueBatch(prompts, existingSet, model, size, quality) {
  const { unique, dupes } = dedupPrompts(prompts, existingSet);

  let queued = 0;
  const tx = db.transaction(() => {
    for (const row of unique) {
      try {
        enqueueGenJob({
          userId: null,
          mode: 'text',
          model,
          size,
          quality,
          prompt: row.prompt,
          negativePrompt: '',
          referenceImageUrl: null,
          maxAttempts: 3,
          publishToPrompts: true,
          initialStatus: 'queued',
          sourceChannel: 'workflow',
          providerName: 'workflow',
          isHeartbeat: false,
          heartbeatRunId: '',
          heartbeatKind: '',
          heartbeatCategory: row.category || '',
          preferredChannel: '',
        });
        queued++;
      } catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes('UNIQUE') || msg.includes('INSUFFICIENT_CREDITS')) {
          // dedup already handled above; skip silently
        } else {
          console.warn(`  enqueue error: ${msg}`);
        }
      }
    }
  });
  tx();

  return { queued, skipped: dupes.length, total: prompts.length };
}

// ─── Queue Stats ───────────────────────────────────────────────────────────
function printQueueStats() {
  const stats = db.prepare(`
    SELECT status, COUNT(1) as c FROM gen_jobs GROUP BY status ORDER BY status
  `).all();
  console.log('\n📊 Queue Status:');
  stats.forEach(s => console.log(`   ${s.status}: ${s.c}`));
  const total = db.prepare("SELECT COUNT(1) as c FROM gen_jobs").get().c;
  console.log(`   TOTAL: ${total}`);
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔍 DeepSeek Prompt Workflow');
  console.log(`   concurrency=${CONCURRENCY} | batchSize=${BATCH_SIZE} | rounds=${ROUNDS}`);
  console.log(`   dryRun=${DRY_RUN} | dedupOnly=${DEDUP_ONLY}`);

  if (!DEEPSEEK_API_KEY) {
    console.error('❌ Missing DEEPSEEK_API_KEY env variable');
    process.exit(1);
  }

  if (DEDUP_ONLY) {
    const existing = loadExistingPrompts();
    console.log(`\n✅ Loaded ${existing.size} existing prompts for dedup`);
    printQueueStats();
    return;
  }

  const existingSet = loadExistingPrompts();
  console.log(`\n✅ Loaded ${existingSet.size} existing prompts for dedup`);

  // 解析固定分类
  let categories = [];
  if (CATEGORY_MODE) {
    categories = CATEGORY_MODE.split(',').map(c => c.trim()).filter(Boolean);
    console.log(`   categories: ${categories.join(', ')}`);
  }

  // 如果没有固定分类，选取不足的分类优先
  if (!CATEGORY_MODE) {
    const rows = db.prepare(`
      SELECT category, COUNT(1) as c FROM prompts WHERE category != '' GROUP BY category ORDER BY c ASC
    `).all();
    const catCounts = new Map(rows.map(r => [r.category, r.c]));
    const allCats = [...DEFAULT_CATEGORIES];
    allCats.sort((a, b) => (catCounts.get(a) || 0) - (catCounts.get(b) || 0));
    categories = allCats.slice(0, Math.min(8, allCats.length));
    console.log(`   auto categories (lowest first): ${categories.join(', ')}`);
  }

  printQueueStats();

  const totalJobs = CONCURRENCY * BATCH_SIZE * ROUNDS;
  console.log(`\n🎯 Target: ${totalJobs} prompts (${ROUNDS} rounds × ${CONCURRENCY} parallel × ${BATCH_SIZE}/batch)`);

  if (DRY_RUN) {
    console.log('\n🧪 DRY RUN - simulating only, no enqueue\n');
  }

  let grandQueued = 0;
  let grandSkipped = 0;
  let roundErrors = 0;

  for (let round = 0; round < ROUNDS; round++) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📦 Round ${round + 1}/${ROUNDS} — launching ${CONCURRENCY} parallel DeepSeek calls`);
    console.log(`${'─'.repeat(60)}`);

    const controllers = Array.from({ length: CONCURRENCY }, () => new AbortController());
    const signals = controllers.map(c => c.signal);

    // 注册全局中断
    const onInterrupt = () => {
      console.log('\n⚠️  Interrupted, cancelling remaining calls...');
      controllers.forEach(c => c.abort());
    };
    process.on('SIGINT', onInterrupt);

    try {
      const batchPromises = Array.from({ length: CONCURRENCY }, async (_, batchIdx) => {
        const controller = controllers[batchIdx];
        try {
          const items = await callDeepSeek({
            categories,
            count: BATCH_SIZE,
            round,
            batchIdx,
            signal: controller.signal,
          });

          const validated = (Array.isArray(items) ? items : [])
            .map(item => ({
              prompt: String(item?.prompt || '').trim(),
              category: String(item?.category || '').trim(),
              tags: Array.isArray(item?.tags)
                ? item.tags.map(t => String(t || '').trim().toLowerCase()).filter(Boolean).slice(0, 6)
                : [],
            }))
            .filter(item => item.prompt.length >= 12);

          if (DRY_RUN) {
            console.log(`  [batch ${batchIdx + 1}] ${validated.length} prompts (dry-run)`);
            validated.forEach((v, i) => console.log(`    ${i + 1}. [${v.category}] ${v.prompt.slice(0, 60)}...`));
            return { queued: 0, skipped: 0, total: validated.length };
          }

          const model = 'gpt-image-2';
          const size = '1024x1024';
          const quality = 'hd';
          const result = enqueueBatch(validated, existingSet, model, size, quality);
          console.log(`  [batch ${batchIdx + 1}] +${result.queued} queued | ${result.skipped} skipped`);
          return result;
        } catch (err) {
          if (err?.name === 'AbortError' || String(err).includes('abort')) {
            console.log(`  [batch ${batchIdx + 1}] cancelled`);
            return { queued: 0, skipped: 0, total: 0, error: 'cancelled' };
          }
          console.error(`  [batch ${batchIdx + 1}] ERROR: ${err?.message || err}`);
          roundErrors++;
          return { queued: 0, skipped: 0, total: 0, error: String(err?.message || err) };
        }
      });

      const results = await Promise.allSettled(batchPromises);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          grandQueued  += result.value.queued  || 0;
          grandSkipped += result.value.skipped  || 0;
        }
      }
    } finally {
      process.off('SIGINT', onInterrupt);
    }

    console.log(`\n   Round ${round + 1} done. Total queued so far: ${grandQueued} | skipped: ${grandSkipped}`);

    // 轮次之间稍作延迟，避免 API 限流
    if (round < ROUNDS - 1 && !DRY_RUN) {
      await sleep(2000);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('✅ Workflow Complete');
  console.log(`   Total queued: ${grandQueued}`);
  console.log(`   Total skipped (dupes): ${grandSkipped}`);
  console.log(`   Round errors: ${roundErrors}`);
  console.log(`${'═'.repeat(60)}`);
  printQueueStats();
}

// ─── Arg Parser ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        if (/^\d+$/.test(next)) result[key] = Number(next);
        else result[key] = next;
        i++;
      } else {
        result[key] = true;
      }
    }
  }
  return result;
}

main().catch(err => {
  console.error('\n❌ Fatal:', err?.message || err);
  process.exit(1);
});