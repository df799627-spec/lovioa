import { CATEGORY_NAMES, inferCategoryAndTags } from './promptTaxonomy.js';

const DEFAULT_BASE_URL = 'https://d1api.xin/v1';
const DEFAULT_MODEL = 'deepseek-v4.1-flash';

function safeParseJson(raw) {
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

function normalizeTags(tags = []) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(
    tags
      .map((tag) => String(tag || '').trim())
      .filter(Boolean),
  )].slice(0, 12);
}

function makeTranslationPrompt(items) {
  return [
    '你是 AI 生图提示词本地化与分类专家。',
    '请把每条英文提示词完整翻译成自然、准确、可直接给中文用户阅读的中文。',
    '不得删减主体、材质、数量、构图、镜头、光线、风格、限制条件或负面约束。',
    '不要凭空添加原文没有的品牌、文字、人物身份或画面元素。',
    '同时为每条提示词选择一个最匹配的分类，并给出 3 到 8 个简洁标签。',
    `允许分类只能是：${CATEGORY_NAMES.join(', ')}`,
    '只返回 JSON，不要 Markdown，不要解释。',
    'JSON 格式：{"results":[{"id":"原始id","promptZh":"完整中文翻译","category":"Ecommerce","tags":["标签1","标签2"]}]}',
    '',
    '待处理提示词：',
    ...items.map((item) => `- id=${JSON.stringify(String(item.id))}; prompt=${JSON.stringify(item.prompt)}`),
  ].join('\n');
}

function fallbackResult(item, rawTags = []) {
  const inferred = inferCategoryAndTags(`${item.prompt} ${rawTags.join(' ')}`);
  return {
    id: String(item.id),
    promptZh: '',
    category: CATEGORY_NAMES.includes(inferred.category) ? inferred.category : 'Generated',
    tags: normalizeTags(rawTags.length ? rawTags : inferred.tags),
    confidence: 0.35,
  };
}

export function getPromptTextConfig(options = {}) {
  return {
    apiKey: String(
      options.apiKey
      || process.env.PROMPT_TEXT_API_KEY
      || process.env.DEEPSEEK_API_KEY
      || '',
    ).trim(),
    baseUrl: String(
      options.baseUrl
      || process.env.PROMPT_TEXT_BASE_URL
      || process.env.DEEPSEEK_BASE_URL
      || DEFAULT_BASE_URL,
    ).replace(/\/+$/, ''),
    model: String(
      options.model
      || process.env.PROMPT_TEXT_MODEL
      || process.env.DEEPSEEK_TAG_MODEL
      || DEFAULT_MODEL,
    ).trim(),
  };
}

export async function translatePromptBatch(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const config = getPromptTextConfig(options);
  if (!config.apiKey) throw new Error('PROMPT_TEXT_API_KEY is missing');

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.1,
      max_tokens: Math.max(1800, items.length * 420),
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: '只输出合法 JSON。每个输入 id 必须原样出现在 results 中。',
        },
        { role: 'user', content: makeTranslationPrompt(items) },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${config.model} HTTP ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  const parsed = safeParseJson(content);
  const rawRows = Array.isArray(parsed?.results) ? parsed.results : [];
  const byId = new Map(items.map((item) => [String(item.id), item]));
  const returned = new Map();

  for (const raw of rawRows) {
    const id = String(raw?.id || '');
    const source = byId.get(id);
    if (!source) continue;
    const inferred = inferCategoryAndTags(source.prompt);
    const category = CATEGORY_NAMES.includes(raw?.category)
      ? raw.category
      : (CATEGORY_NAMES.includes(inferred.category) ? inferred.category : 'Generated');
    const promptZh = String(raw?.promptZh || '').trim();
    if (!promptZh) continue;
    returned.set(id, {
      id,
      promptZh,
      category,
      tags: normalizeTags(raw?.tags || inferred.tags),
      confidence: 0.9,
    });
  }

  return items.map((item) => returned.get(String(item.id)) || fallbackResult(item, item.tags || []));
}

export { DEFAULT_BASE_URL, DEFAULT_MODEL };
