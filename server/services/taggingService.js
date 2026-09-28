const DEFAULT_BASE_URL = 'https://d1api.xin/v1';
const DEFAULT_MODEL = 'deepseek-v4.1-flash';
import { inferCategoryAndTags } from './promptTaxonomy.js';

const TAXONOMY = {
  categories: [
    'Portrait', 'Landscape', 'Fashion', 'Editorial', 'Abstract', 'Street',
    'UIDesign', 'Gaming', 'Architecture', 'Ecommerce', 'Food', 'Travel',
    'Illustration', 'SocialMedia', 'Avatar', 'Brand', 'Generated',
  ],
  tagExamples: [
    'cinematic', 'studio', 'soft-light', 'rim-light', 'golden-hour', 'neon',
    'high-detail', 'realistic', 'anime', 'cyberpunk', 'flat-lay', 'product-shot',
    'close-up', 'wide-shot', 'minimal', 'vintage', 'documentary', 'luxury',
  ],
};

function makePromptForBatch(items) {
  return [
    'You are an expert taxonomy tagger for AI image prompts.',
    'For each input item, return:',
    '- category: one value from allowed categories',
    '- tags: 5 to 10 concise lowercase tags',
    '- confidence: 0 to 1',
    '',
    `Allowed categories: ${TAXONOMY.categories.join(', ')}`,
    `Tag examples: ${TAXONOMY.tagExamples.join(', ')}`,
    '',
    'Return JSON only in this shape:',
    '{"results":[{"id":"...", "category":"...", "tags":["..."], "confidence":0.0}]}',
    '',
    'Items:',
    ...items.map((item) => `- id=${item.id}; prompt=${JSON.stringify(item.prompt)}`),
  ].join('\n');
}

function normalizeTagList(tags, limit = 12) {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, Math.max(1, Number(limit || 12)));
  return [...new Set(cleaned)];
}

function safeParseModelJson(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  try { return JSON.parse(text); } catch {}
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(text.slice(first, last + 1)); } catch {}
  }
  return null;
}

function inferCategoryFallback({ prompt = '', tags = [] } = {}) {
  return inferCategoryAndTags(
    `${String(prompt || '')} ${(Array.isArray(tags) ? tags.join(' ') : '')}`,
  ).category;
}

export async function tagPromptBatchWithDeepSeek(items, options = {}) {
  const apiKey = String(options.apiKey || process.env.PROMPT_TEXT_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) throw new Error('PROMPT_TEXT_API_KEY is missing');
  const baseUrl = String(options.baseUrl || process.env.PROMPT_TEXT_BASE_URL || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = String(options.model || process.env.PROMPT_TEXT_MODEL || process.env.DEEPSEEK_TAG_MODEL || DEFAULT_MODEL);

  if (!Array.isArray(items) || items.length === 0) return [];

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Output strict JSON only.' },
        { role: 'user', content: makePromptForBatch(items) },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = safeParseModelJson(content);
  const rows = Array.isArray(parsed?.results) ? parsed.results : [];

  const byId = new Map(items.map((item) => [String(item.id), item]));
  const normalized = [];
  for (const row of rows) {
    const id = String(row?.id || '');
    if (!byId.has(id)) continue;
    const tags = normalizeTagList(row?.tags || [], 12);
    const fallbackCategory = inferCategoryFallback({ prompt: byId.get(id)?.prompt || '', tags });
    const category = TAXONOMY.categories.includes(row?.category) ? row.category : fallbackCategory;
    const confidence = Math.max(0, Math.min(1, Number(row?.confidence ?? 0.7)));
    normalized.push({ id, category, tags, confidence });
  }

  // fallback for any missing ids
  for (const item of items) {
    if (normalized.find((n) => n.id === item.id)) continue;
    const fallbackCategory = inferCategoryFallback({ prompt: item.prompt || '', tags: item.tags || [] });
    normalized.push({
      id: String(item.id),
      category: fallbackCategory,
      tags: normalizeTagList(item.tags || [], 12),
      confidence: 0.5,
    });
  }

  return normalized;
}

export async function tagPromptsInParallel(items, options = {}) {
  const batchSize = Math.max(1, Number(options.batchSize || 10));
  const concurrency = Math.max(1, Number(options.concurrency || 10));
  const chunks = [];
  for (let i = 0; i < items.length; i += batchSize) chunks.push(items.slice(i, i + batchSize));

  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, chunks.length) }).map(async () => {
    while (cursor < chunks.length) {
      const idx = cursor++;
      const chunk = chunks[idx];
      const tagged = await tagPromptBatchWithDeepSeek(chunk, options);
      results.push(...tagged);
    }
  });
  await Promise.all(workers);
  return results;
}
