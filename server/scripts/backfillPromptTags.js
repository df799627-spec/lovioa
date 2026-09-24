/**
 * Backfill prompt category/tags in prompts table with rule-based inference.
 *
 * Usage:
 *   node backfillPromptTags.js                   # dry run (generated-like rows only)
 *   node backfillPromptTags.js --apply           # apply updates
 *   node backfillPromptTags.js --all --apply     # retag all prompts
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, '../data/lovioa.db');

const apply = process.argv.includes('--apply');
const all = process.argv.includes('--all');

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

const where = all
  ? ''
  : "WHERE id LIKE 'gen-%' OR category = 'Generated' OR author_name = 'Lovioa'";

const rows = db.prepare(`
  SELECT id, prompt, category, tags_json
  FROM prompts
  ${where}
`).all();

const updates = [];
for (const row of rows) {
  const inferred = inferCategoryAndTags(row.prompt || '');
  const currentTags = parseTags(row.tags_json);
  const hasCategory = !!String(row.category || '').trim();

  const nextCategory = (!hasCategory || row.category === 'Generated' || all) ? inferred.category : row.category;
  const nextTags = (currentTags.length === 0 || all) ? inferred.tags : currentTags;

  if (nextCategory !== row.category || JSON.stringify(nextTags) !== JSON.stringify(currentTags)) {
    updates.push({
      id: row.id,
      category: nextCategory,
      tags_json: JSON.stringify(nextTags),
    });
  }
}

console.log(`Target rows: ${rows.length}`);
console.log(`Rows to update: ${updates.length}`);
console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
console.log(`Scope: ${all ? 'ALL PROMPTS' : 'GENERATED-LIKE ONLY'}`);

if (apply && updates.length) {
  const stmt = db.prepare(`
    UPDATE prompts
    SET category = @category, tags_json = @tags_json
    WHERE id = @id
  `);
  const tx = db.transaction((items) => {
    for (const item of items) stmt.run(item);
  });
  tx(updates);
}

const summary = {
  prompts_total: db.prepare('SELECT COUNT(1) AS c FROM prompts').get().c,
  generated_like: db.prepare("SELECT COUNT(1) AS c FROM prompts WHERE id LIKE 'gen-%' OR category='Generated' OR author_name='Lovioa'").get().c,
  category_generated: db.prepare("SELECT COUNT(1) AS c FROM prompts WHERE category='Generated'").get().c,
};
console.log(summary);

db.close();
