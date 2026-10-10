/**
 * Merge generated image records into prompts table so /api/prompts is the single feed.
 *
 * Usage:
 *   node migrateGeneratedToPrompts.js            # dry run
 *   node migrateGeneratedToPrompts.js --apply    # write into prompts
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, '../data/lovioa.db');
const apply = process.argv.includes('--apply');

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

const TAG_RULES = [
  { tag: 'Portrait', category: 'Portrait', re: /\bportrait|headshot|selfie|beauty|face|skin|人物|人像|头像|写真/i },
  { tag: 'Fashion', category: 'Fashion', re: /\bfashion|lookbook|couture|runway|style|outfit|服装|时尚|穿搭/i },
  { tag: 'Editorial', category: 'Editorial', re: /\beditorial|magazine|cover|spread|vogue|harper|杂志|大片/i },
  { tag: 'Landscape', category: 'Landscape', re: /\blandscape|mountain|forest|sea|ocean|sunset|sunrise|nature|风景|山|海|森林/i },
  { tag: 'Architecture', category: 'Architecture', re: /\barchitecture|interior|building|brutalist|house|room|建筑|室内|空间/i },
  { tag: 'Gaming', category: 'Gaming', re: /\bgame|rpg|character|sprite|ui asset|icon set|metroidvania|像素|游戏|角色|立绘/i },
  { tag: 'E-commerce', category: 'Ecommerce', re: /\be-?commerce|product page|shop|listing|amazon|淘宝|电商|商品/i },
  { tag: 'UI Design', category: 'UIDesign', re: /\bui|ux|app interface|dashboard|wireframe|mockup|界面|设计稿/i },
  { tag: 'Branding', category: 'Brand', re: /\bbrand|branding|identity|logo|campaign|品牌|标识/i },
  { tag: 'Illustration', category: 'Illustration', re: /\billustration|drawing|sketch|comic|manga|插画|绘图/i },
  { tag: 'Social Media', category: 'SocialMedia', re: /\bsocial media|instagram|tiktok|xiaohongshu|小红书|社媒/i },
  { tag: 'Food', category: 'Food', re: /\bfood|beverage|dessert|drink|coffee|restaurant|美食|饮品/i },
  { tag: 'Travel', category: 'Travel', re: /\btravel|destination|tourism|vacation|trip|旅行|旅拍/i },
  { tag: 'Street', category: 'Street', re: /\bstreet|urban|city|neon|alley|街头|城市/i },
  { tag: 'Abstract', category: 'Abstract', re: /\babstract|surreal|geometric|experimental|glitch|抽象|超现实/i },
  { tag: 'Avatar', category: 'Avatar', re: /\bavatar|profile picture|pfp|人物头像|头像/i },
];

function inferCategoryAndTags(promptText = '') {
  const text = String(promptText || '');
  const tags = [];
  const score = new Map();

  for (const rule of TAG_RULES) {
    if (rule.re.test(text)) {
      if (!tags.includes(rule.tag)) tags.push(rule.tag);
      score.set(rule.category, (score.get(rule.category) || 0) + 1);
    }
  }

  let category = 'Generated';
  let best = 0;
  for (const [cat, sc] of score.entries()) {
    if (sc > best) {
      best = sc;
      category = cat;
    }
  }
  if (tags.length === 0) tags.push('Generated');
  return { category, tags: tags.slice(0, 8) };
}

function parseTags(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr.filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
}

const rows = db.prepare(`
  SELECT
    id,
    source_prompt AS prompt,
    image_url,
    category,
    tags_json,
    author_name,
    author_avatar,
    author_user_id,
    created_at
  FROM generated_images
  UNION ALL
  SELECT
    h.id AS id,
    h.prompt AS prompt,
    h.image_url AS image_url,
    '' AS category,
    '[]' AS tags_json,
    'Lovioa' AS author_name,
    'https://api.dicebear.com/7.x/miniavs/svg?seed=pf' AS author_avatar,
    h.user_id AS author_user_id,
    h.created_at AS created_at
  FROM gen_history h
`).all();

const byId = new Map();
for (const row of rows) {
  if (!row?.id) continue;
  if (!row.image_url || String(row.image_url).startsWith('data:')) continue;
  if (!byId.has(row.id)) byId.set(row.id, row);
}

const existingPromptIds = new Set(
  db.prepare("SELECT id FROM prompts WHERE id LIKE 'gen-%'").all().map(r => r.id),
);

const candidates = [];
for (const row of byId.values()) {
  const promptId = `gen-${row.id}`;
  if (existingPromptIds.has(promptId)) continue;

  const inferred = inferCategoryAndTags(row.prompt || '');
  const tags = parseTags(row.tags_json);
  candidates.push({
    id: promptId,
    image_url: row.image_url,
    prompt: row.prompt || '',
    author_name: row.author_name || 'Lovioa',
    author_avatar: row.author_avatar || 'https://api.dicebear.com/7.x/miniavs/svg?seed=pf',
    author_prompt_count: 0,
    author_user_id: row.author_user_id || null,
    tags_json: JSON.stringify((tags.length ? tags : inferred.tags).slice(0, 8)),
    category: row.category || inferred.category,
    likes: 0,
    liked: 0,
    saved: 0,
    created_at: row.created_at || new Date().toISOString(),
  });
}

console.log(`Merged source rows: ${rows.length}`);
console.log(`Unique generated rows: ${byId.size}`);
console.log(`New prompts to insert: ${candidates.length}`);
console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);

if (apply && candidates.length) {
  const insert = db.prepare(`
    INSERT INTO prompts (
      id, image_url, prompt, author_name, author_avatar, author_prompt_count, author_user_id,
      tags_json, category, likes, liked, saved, created_at
    ) VALUES (
      @id, @image_url, @prompt, @author_name, @author_avatar, @author_prompt_count, @author_user_id,
      @tags_json, @category, @likes, @liked, @saved, @created_at
    )
  `);
  const tx = db.transaction((items) => {
    for (const item of items) insert.run(item);
  });
  tx(candidates);
}

const summary = {
  prompts_total: db.prepare('SELECT COUNT(1) AS c FROM prompts').get().c,
  prompts_generated: db.prepare("SELECT COUNT(1) AS c FROM prompts WHERE id LIKE 'gen-%'").get().c,
};
console.log(summary);

db.close();
