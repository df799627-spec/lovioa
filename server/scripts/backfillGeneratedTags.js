/**
 * Backfill category/tags for generated images and migrate missing history rows.
 *
 * Usage:
 *   node backfillGeneratedTags.js            # dry-run
 *   node backfillGeneratedTags.js --apply    # write changes
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { inferCategoryAndTags as classifyPrompt } from '../services/promptTaxonomy.js';

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
  return classifyPrompt(promptText);
}

function parseTags(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// 1) Ensure generated_images exists
db.exec(`
CREATE TABLE IF NOT EXISTS generated_images (
  id TEXT PRIMARY KEY,
  prompt_id TEXT,
  source_prompt TEXT NOT NULL,
  model TEXT,
  image_url TEXT NOT NULL,
  category TEXT,
  tags_json TEXT,
  author_name TEXT DEFAULT 'Lovioa',
  author_avatar TEXT DEFAULT 'https://api.dicebear.com/7.x/miniavs/svg?seed=pf',
  likes INTEGER DEFAULT 0,
  liked INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  author_user_id TEXT,
  gen_job_id TEXT
);
`);

// 2) Insert missing rows from gen_history
const missingHistory = db.prepare(`
  SELECT h.*
  FROM gen_history h
  LEFT JOIN generated_images g ON g.id = h.id
  WHERE g.id IS NULL
    AND h.image_url NOT LIKE 'data:%'
`).all();

const insertGenerated = db.prepare(`
  INSERT INTO generated_images (
    id, source_prompt, model, image_url, category, tags_json, author_name, author_avatar, created_at, gen_job_id
  ) VALUES (
    @id, @source_prompt, @model, @image_url, @category, @tags_json, 'Lovioa',
    'https://api.dicebear.com/7.x/miniavs/svg?seed=pf', @created_at, @gen_job_id
  )
`);

// 3) Backfill category/tags for existing generated_images
const generatedRows = db.prepare(`
  SELECT id, source_prompt, category, tags_json
  FROM generated_images
`).all();

const updates = [];
for (const row of generatedRows) {
  const currentTags = parseTags(row.tags_json);
  const hasCategory = !!String(row.category || '').trim();
  const needsTags = currentTags.length === 0;
  const needsCategory = !hasCategory || row.category === 'Generated';
  if (!needsTags && !needsCategory) continue;

  const inferred = inferCategoryAndTags(row.source_prompt);
  updates.push({
    id: row.id,
    category: needsCategory ? inferred.category : row.category,
    tags_json: needsTags ? JSON.stringify(inferred.tags) : JSON.stringify(currentTags.slice(0, 8)),
  });
}

console.log(`Missing from gen_history -> generated_images: ${missingHistory.length}`);
console.log(`Rows needing tag/category backfill: ${updates.length}`);
console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);

if (apply) {
  const tx = db.transaction(() => {
    for (const h of missingHistory) {
      const inferred = inferCategoryAndTags(h.prompt);
      insertGenerated.run({
        id: h.id,
        source_prompt: h.prompt || '',
        model: h.model || '',
        image_url: h.image_url || '',
        category: inferred.category,
        tags_json: JSON.stringify(inferred.tags),
        created_at: h.created_at,
        gen_job_id: h.job_id || null,
      });
    }

    const updateStmt = db.prepare(`
      UPDATE generated_images
      SET category = @category, tags_json = @tags_json
      WHERE id = @id
    `);
    for (const u of updates) updateStmt.run(u);
  });
  tx();
  console.log('Backfill applied.');
}

const finalCounts = {
  generated_images: db.prepare('SELECT COUNT(1) AS c FROM generated_images').get().c,
  gen_history: db.prepare('SELECT COUNT(1) AS c FROM gen_history').get().c,
};
console.log(finalCounts);

db.close();
