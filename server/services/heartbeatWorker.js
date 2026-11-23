import {
  createHeartbeatRun,
  touchHeartbeatRun,
  refreshHeartbeatRunFromJobs,
  enqueueGenJob,
  db,
} from '../db/promptsRepo.js';
import {
  buildCategoryGenerationBrief,
  composeCategoryPrompt,
  normalizeGenerationCategory,
} from './categoryPromptBlueprints.js';

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_CATEGORY_POOL = [
  'Portrait', 'Landscape', 'Fashion', 'Editorial', 'Abstract', 'Street',
  'UIDesign', 'Gaming', 'Architecture', 'Ecommerce', 'Food', 'Travel',
  'Illustration', 'SocialMedia', 'Avatar', 'Brand',
];
const DEFAULT_CATEGORY_TARGET = 120;
const DEFAULT_MAX_BACKFILL_CATEGORIES = 6;

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
        bases: [
          ...(Array.isArray(ch?.baseUrls) ? ch.baseUrls : []),
          ch?.baseUrl,
          ch?.baseUrlCn,
          ch?.backupBaseUrl,
          ch?.fallbackBaseUrl,
        ]
          .map((v) => String(v || '').trim().replace(/\/+$/, ''))
          .filter(Boolean),
      }))
      .filter((ch) => ch.name && ch.enabled);
  } catch {
    return [];
  }
}

function parseChannelDistribution(raw) {
  if (!String(raw || '').trim()) return [];
  const out = [];
  for (const part of String(raw).split(',')) {
    const p = part.trim();
    if (!p) continue;
    // split by the last ":" so keys like "provider@https://host" remain intact
    const idx = p.lastIndexOf(':');
    const key = String(idx >= 0 ? p.slice(0, idx) : p).trim();
    const countRaw = idx >= 0 ? p.slice(idx + 1) : '';
    const count = normalizePositiveInt(countRaw, 1);
    if (!key) continue;
    out.push({ key, count });
  }
  return out;
}

function pickUnderrepresentedCategories(limit = 3) {
  const rows = db.prepare(`
    SELECT category, COUNT(1) AS c
    FROM prompts
    WHERE category IS NOT NULL
      AND TRIM(category) != ''
    GROUP BY category
    ORDER BY c ASC, category ASC
  `).all();
  const existing = rows
    .map((r) => ({ category: String(r.category || '').trim(), count: Number(r.c || 0) }))
    .filter((r) => r.category);

  const normalizedExisting = new Set(existing.map((r) => r.category));
  const synthesized = [];
  for (const cat of DEFAULT_CATEGORY_POOL) {
    if (normalizedExisting.has(cat)) continue;
    synthesized.push({ category: cat, count: 0 });
  }

  const merged = [...synthesized, ...existing]
    .sort((a, b) => a.count - b.count || a.category.localeCompare(b.category));
  return merged.slice(0, Math.max(1, Number(limit || 3))).map((x) => x.category);
}

function buildLowStockCategoryPlan({
  targetPerCategory = DEFAULT_CATEGORY_TARGET,
  maxCategories = DEFAULT_MAX_BACKFILL_CATEGORIES,
  totalCount = 12,
} = {}) {
  const target = Math.max(1, Number(targetPerCategory || DEFAULT_CATEGORY_TARGET));
  const topN = Math.max(1, Number(maxCategories || DEFAULT_MAX_BACKFILL_CATEGORIES));
  const wanted = Math.max(1, Number(totalCount || 12));

  const rows = db.prepare(`
    SELECT category, COUNT(1) AS c
    FROM prompts
    WHERE category IS NOT NULL
      AND TRIM(category) != ''
    GROUP BY category
  `).all();

  const counts = new Map();
  for (const row of rows) {
    const cat = String(row.category || '').trim();
    if (!cat) continue;
    counts.set(cat, Number(row.c || 0));
  }

  const deficits = DEFAULT_CATEGORY_POOL.map((category) => {
    const current = Number(counts.get(category) || 0);
    return {
      category,
      current,
      deficit: Math.max(0, target - current),
    };
  })
    .filter((x) => x.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit || a.current - b.current || a.category.localeCompare(b.category))
    .slice(0, topN);

  if (deficits.length === 0) {
    const fallback = pickUnderrepresentedCategories(Math.min(topN, wanted));
    const plan = [];
    for (let i = 0; i < wanted; i++) {
      plan.push(fallback[i % fallback.length] || DEFAULT_CATEGORY_POOL[i % DEFAULT_CATEGORY_POOL.length]);
    }
    return {
      strategy: 'fallback_underrepresented',
      plan,
      categories: [...new Set(plan)],
      deficits: [],
    };
  }

  const remaining = deficits.map((x) => ({ ...x }));
  const plan = [];
  while (plan.length < wanted) {
    remaining.sort((a, b) => b.deficit - a.deficit || a.current - b.current || a.category.localeCompare(b.category));
    const hit = remaining.find((x) => x.deficit > 0);
    if (!hit) break;
    plan.push(hit.category);
    hit.deficit -= 1;
  }

  while (plan.length < wanted) {
    plan.push(deficits[plan.length % deficits.length].category);
  }

  return {
    strategy: 'low_stock_backfill',
    plan,
    categories: [...new Set(plan)],
    deficits,
  };
}

async function generatePromptsWithDeepSeek({
  apiKey,
  baseUrl = DEFAULT_DEEPSEEK_BASE_URL,
  model = DEFAULT_DEEPSEEK_MODEL,
  categories = [],
  categoryPlan = [],
  count = 12,
  logger = console,
}) {
  if (!apiKey) throw new Error('Heartbeat deepseek api key missing');
  const normalizedCount = Math.max(1, Number(count || 12));
  const cats = (Array.isArray(categories) ? categories : []).filter(Boolean);
  const normalizedPlan = Array.isArray(categoryPlan) ? categoryPlan.map((x) => String(x || '').trim()).filter(Boolean) : [];
  const plan = normalizedPlan.length > 0
    ? normalizedPlan.slice(0, normalizedCount)
    : Array.from({ length: normalizedCount }, (_, index) => cats[index % (cats.length || DEFAULT_CATEGORY_POOL.length)] || DEFAULT_CATEGORY_POOL[index % DEFAULT_CATEGORY_POOL.length]);
  const quotaMap = new Map();
  for (const category of plan) {
    const normalized = normalizeGenerationCategory(category) || 'Abstract';
    quotaMap.set(normalized, (quotaMap.get(normalized) || 0) + 1);
  }

  const requestCategoryBatch = async (category, batchCount) => {
    const userPrompt = [
      'Generate JSON only.',
      `Need ${batchCount} unique English image prompts for the single target category "${category}".`,
      'Every prompt must visibly and unambiguously belong to this category.',
      'Do not mix categories. Return the exact same category value for every item.',
      buildCategoryGenerationBrief(category),
      'Return strict JSON format:',
      '{"items":[{"prompt":"...","category":"...","tags":["...","..."]}]}',
      'Rules:',
      '- prompt length between 18 and 45 words',
      '- no banned words, no NSFW',
      '- tags 3-6 concise lowercase tokens',
      `- category must be exactly "${category}"`,
      `- output exactly ${batchCount} items`,
    ].join('\n');
    const res = await fetch(`${String(baseUrl).replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.65,
        max_tokens: Math.max(1000, batchCount * 220),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You output strict JSON only and obey the target category literally.' },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`DeepSeek HTTP ${res.status}: ${text.slice(0, 500)}`);
    const payload = safeJson(text);
    const content = payload?.choices?.[0]?.message?.content || '';
    const parsed = safeJson(content) || safeJson(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1));
    const rows = Array.isArray(parsed?.items) ? parsed.items : [];
    return rows
      .map((row) => ({
        prompt: composeCategoryPrompt(String(row?.prompt || '').trim(), category),
        category,
        tags: Array.isArray(row?.tags) ? row.tags.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 8) : [],
      }))
      .filter((row) => row.prompt.length >= 10)
      .slice(0, batchCount);
  };

  const batches = await Promise.all(
    [...quotaMap.entries()].map(([category, batchCount]) => requestCategoryBatch(category, batchCount)),
  );
  const byCategory = new Map();
  for (const batch of batches) {
    for (const row of batch) {
      const list = byCategory.get(row.category) || [];
      list.push(row);
      byCategory.set(row.category, list);
    }
  }
  const output = [];
  for (const category of plan) {
    const normalized = normalizeGenerationCategory(category) || 'Abstract';
    const list = byCategory.get(normalized) || [];
    const next = list.shift();
    if (next) output.push(next);
  }
  if (output.length === 0) logger.warn('[heartbeat] deepseek returned no valid prompts, using fallback templates');
  return output;
}

function fallbackPrompts({ categories = [], categoryPlan = [], count = 12 }) {
  const weighted = Array.isArray(categoryPlan) && categoryPlan.length > 0 ? categoryPlan : [];
  const cats = weighted.length > 0
    ? [...new Set(weighted)]
    : (Array.isArray(categories) && categories.length > 0 ? categories : DEFAULT_CATEGORY_POOL);
  const output = [];
  for (let i = 0; i < count; i++) {
    const cat = weighted.length > 0 ? weighted[i % weighted.length] : cats[i % cats.length];
    output.push({
      prompt: composeCategoryPrompt(
        `High detail ${cat.toLowerCase()} concept, cinematic lighting, clean composition, professional quality, test sample ${i + 1}`,
        cat,
      ),
      category: cat,
      tags: ['stability', 'heartbeat', cat.toLowerCase()],
    });
  }
  return output;
}

export function startHeartbeatWorker({
  enabled = false,
  intervalMs = 15 * 60 * 1000,
  batchSize = 12,
  categoryTarget = DEFAULT_CATEGORY_TARGET,
  maxBackfillCategories = DEFAULT_MAX_BACKFILL_CATEGORIES,
  deepseekApiKey = '',
  deepseekBaseUrl = DEFAULT_DEEPSEEK_BASE_URL,
  deepseekModel = DEFAULT_DEEPSEEK_MODEL,
  defaultModel = 'gpt-image-2',
  defaultSize = '1024x1024',
  defaultQuality = 'hd',
  fastChannelsRaw = '',
  channelDistributionRaw = '',
  slowEnabled = false,
  includeSlowChannel = true,
  logger = console,
} = {}) {
  let stopped = false;
  let running = false;

  const knownChannels = parseChannels(fastChannelsRaw);
  const explicitDistribution = parseChannelDistribution(channelDistributionRaw);

  const knownTargets = (() => {
    const out = [];
    for (const ch of knownChannels) {
      const bases = Array.isArray(ch.bases) ? ch.bases : [];
      if (bases.length === 0) {
        out.push({ key: ch.name, providerName: ch.name });
      } else {
        for (const base of bases) {
          out.push({ key: `${ch.name}@${base}`, providerName: ch.name });
        }
      }
    }
    if (includeSlowChannel && slowEnabled) {
      out.push({ key: 'slow', providerName: 'slow' });
    }
    return out;
  })();

  const targetsByProvider = (() => {
    const map = new Map();
    for (const t of knownTargets) {
      const list = map.get(t.providerName) || [];
      list.push(t);
      map.set(t.providerName, list);
    }
    return map;
  })();

  function buildChannelPlan(total) {
    if (knownTargets.length === 0) return [];

    if (explicitDistribution.length > 0) {
      const template = [];
      for (const entry of explicitDistribution) {
        const direct = knownTargets.find((t) => t.key === entry.key);
        if (direct) {
          for (let i = 0; i < entry.count; i++) template.push(direct);
          continue;
        }

        const providerTargets = targetsByProvider.get(entry.key) || [];
        if (providerTargets.length > 0) {
          for (let i = 0; i < entry.count; i++) {
            template.push(providerTargets[i % providerTargets.length]);
          }
        }
      }

      if (template.length > 0) {
        const out = [];
        for (let i = 0; i < total; i++) out.push(template[i % template.length]);
        return out;
      }
    }

    const out = [];
    for (let i = 0; i < total; i++) out.push(knownTargets[i % knownTargets.length]);
    return out;
  }

  async function runOnce(kind = 'api_stability', options = {}) {
    if (running) {
      logger.info('[heartbeat] run skipped: previous run still active');
      return null;
    }
    running = true;
    try {
      const size = normalizePositiveInt(options.batchSize, normalizePositiveInt(batchSize, 12));
      const mode = String(options.mode || (kind === 'category_backfill' ? 'low_stock_backfill' : 'underrepresented')).trim();
      const targetPerCategory = normalizePositiveInt(options.targetPerCategory, normalizePositiveInt(categoryTarget, DEFAULT_CATEGORY_TARGET));
      const topCategoryCount = normalizePositiveInt(options.maxCategories, normalizePositiveInt(maxBackfillCategories, DEFAULT_MAX_BACKFILL_CATEGORIES));
      let categories = [];
      let categoryPlan = [];
      let planDetails = { strategy: mode };

      if (mode === 'low_stock_backfill') {
        const plan = buildLowStockCategoryPlan({
          targetPerCategory,
          maxCategories: Math.min(topCategoryCount, size),
          totalCount: size,
        });
        categories = plan.categories;
        categoryPlan = plan.plan;
        planDetails = {
          strategy: plan.strategy,
          deficits: plan.deficits,
          targetPerCategory,
          maxCategories: topCategoryCount,
        };
      } else {
        categories = pickUnderrepresentedCategories(Math.min(6, size));
        categoryPlan = [];
      }

      const channelPlan = buildChannelPlan(size);

      const run = createHeartbeatRun({
        kind,
        plannedJobs: size,
        generatedCategories: categories,
        details: {
          model: deepseekModel,
          size,
          mode,
          categories,
          categoryPlan,
          targetPerCategory,
          maxCategories: topCategoryCount,
          planDetails,
          channelPlan,
        },
      });

      let generated = [];
      try {
        generated = await generatePromptsWithDeepSeek({
          apiKey: deepseekApiKey,
          baseUrl: deepseekBaseUrl,
          model: deepseekModel,
          categories,
          categoryPlan,
          count: size,
          logger,
        });
      } catch (err) {
        logger.warn(`[heartbeat] deepseek generation failed: ${err?.message || err}`);
      }

      if (generated.length === 0) {
        generated = fallbackPrompts({ categories, categoryPlan, count: size });
      }

      let queued = 0;
      for (let i = 0; i < generated.length; i++) {
        const row = generated[i];
        const target = channelPlan[i] || null;
        const preferredChannel = target?.key || '';
        const preferredProvider = target?.providerName || '';
        const job = enqueueGenJob({
          userId: null,
          mode: 'text',
          model: defaultModel,
          size: defaultSize,
          quality: defaultQuality,
          prompt: row.prompt,
          maxAttempts: 2,
          publishToPrompts: true,
          initialStatus: 'queued',
          sourceChannel: preferredChannel,
          providerName: preferredProvider,
          isHeartbeat: true,
          heartbeatRunId: run.id,
          heartbeatKind: kind,
          heartbeatCategory: row.category || '',
          category: normalizeGenerationCategory(row.category) || '',
          preferredChannel,
        });
        if (job?.id) queued += 1;
      }

      touchHeartbeatRun(run.id, {
        queuedJobs: queued,
        details: {
          model: deepseekModel,
          size,
          mode,
          categories,
          categoryPlan,
          targetPerCategory,
          maxCategories: topCategoryCount,
          planDetails,
          queued,
          channelPlan,
          generatedSample: generated.slice(0, 5),
        },
      });

      // do one immediate refresh so admin sees latest counters.
      refreshHeartbeatRunFromJobs(run.id);
      logger.info(`[heartbeat] run=${run.id} queued=${queued}`);
      return run;
    } finally {
      running = false;
    }
  }

  async function loop() {
    while (!stopped) {
      if (!enabled) {
        await sleep(2000);
        continue;
      }
      try {
        await runOnce('api_stability');
      } catch (err) {
        logger.error('[heartbeat] run error:', err);
      }
      await sleep(Math.max(10_000, Number(intervalMs || 900000)));
    }
  }

  const waitPromise = loop();

  return {
    async triggerOnce(kind = 'manual', options = {}) {
      if (typeof kind === 'object' && kind !== null) {
        const normalizedKind = String(kind.kind || 'manual');
        return runOnce(normalizedKind, kind);
      }
      return runOnce(kind, options || {});
    },
    stop() {
      stopped = true;
    },
    async wait() {
      try { await waitPromise; } catch {}
    },
  };
}
