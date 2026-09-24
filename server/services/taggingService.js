const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_MODEL = 'deepseek-chat';

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

const CATEGORY_KEYWORDS = [
  { category: 'Portrait', keywords: ['portrait', 'headshot', 'beauty', 'selfie', '人像', '肖像', '写真', '特写'] },
  { category: 'Fashion', keywords: ['fashion', 'runway', 'lookbook', 'outfit', '时尚', '穿搭', '服装'] },
  { category: 'Editorial', keywords: ['editorial', 'magazine', 'cover', '杂志', '封面'] },
  { category: 'Landscape', keywords: ['landscape', 'mountain', 'forest', 'ocean', 'sunset', '风景', '山', '海', '森林'] },
  { category: 'Street', keywords: ['street', 'urban', 'city', 'neon', '街头', '城市', '霓虹'] },
  { category: 'Architecture', keywords: ['architecture', 'interior', 'building', '建筑', '室内', '空间'] },
  { category: 'Ecommerce', keywords: ['ecommerce', 'product', 'listing', '商品', '电商', '产品图'] },
  { category: 'Food', keywords: ['food', 'dessert', 'coffee', 'restaurant', '美食', '甜点', '饮品'] },
  { category: 'Travel', keywords: ['travel', 'destination', 'vacation', '旅行', '旅拍', '度假'] },
  { category: 'Gaming', keywords: ['game', 'gaming', 'rpg', 'sprite', 'character', '游戏', '角色', '立绘'] },
  { category: 'UIDesign', keywords: ['ui', 'ux', 'dashboard', 'mockup', '界面', '设计稿'] },
  { category: 'Brand', keywords: ['brand', 'branding', 'logo', '品牌', '标识'] },
  { category: 'Illustration', keywords: ['illustration', 'drawing', 'manga', '插画', '手绘'] },
  { category: 'SocialMedia', keywords: ['social media', 'instagram', 'tiktok', '小红书', '抖音'] },
  { category: 'Avatar', keywords: ['avatar', 'pfp', 'profile picture', '头像'] },
  { category: 'Abstract', keywords: ['abstract', 'surreal', 'geometric', '抽象', '超现实'] },
];

function inferCategoryFallback({ prompt = '', tags = [] } = {}) {
  const text = `${String(prompt || '')} ${(Array.isArray(tags) ? tags.join(' ') : '')}`.toLowerCase();
  let bestCategory = 'Generated';
  let bestScore = 0;
  for (const rule of CATEGORY_KEYWORDS) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (text.includes(String(keyword).toLowerCase())) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = rule.category;
    }
  }
  return bestCategory;
}

export async function tagPromptBatchWithDeepSeek(items, options = {}) {
  const apiKey = String(options.apiKey || process.env.DEEPSEEK_API_KEY || '').trim();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is missing');
  const baseUrl = String(options.baseUrl || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = String(options.model || process.env.DEEPSEEK_TAG_MODEL || DEFAULT_MODEL);

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
