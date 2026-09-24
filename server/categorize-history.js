#!/usr/bin/env node
/**
 * categorize-history.js
 *
 * 1. 给 gen_history 加 category 列（如不存在）
 * 2. 用关键词规则对所有历史行推理分类（支持中英文）
 * 3. 直接 UPDATE category 字段（幂等，可重复运行）
 * 4. VERIFY 后 VACUUM
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE   = join(__dirname, 'data/lovioa.db');

const db = Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');

// ─── Bilingual keyword lists (tested with .includes() for CJK safety) ────────
const PORTRAIT_KW   = ['portrait','headshot','selfie','beauty','face','skin',
                       'profile','silhouette','lifestyle','human','woman','man',
                       '模特','写真','人像','人物','自拍','头像','棚拍'];
const EDITORIAL_KW  = ['editorial','magazine','cover','spread','vogue','elle',
                       'harper','glamour','campaign','advertising','luxury editorial',
                       '大片','杂志','奢侈','品牌广告'];
const FASHION_KW    = ['fashion','lookbook','couture','runway','outfit','dress',
                       'shoe','leather','wardrobe','accessory','styling','garment',
                       'clothing','apparel','beauty editorial',
                       '时尚','穿搭','服装','服饰'];
const LANDSCAPE_KW  = ['landscape','mountain','forest','sea','ocean','sunset',
                       'sunrise','nature','sky','cloud','water','beach','river',
                       'meadow','valley','horizon','park','jungle','desert',
                       'canyon','glacier','aerial view',
                       '风景','海','山','日落','日出','森林','沙漠','自然'];
const STREET_KW     = ['street','urban','city','neon','alley','downtown','metro',
                       'subway','sidewalk','pavement','rooftop','cityscape','lantern',
                       'night.*city','街头','城市','霓虹','巷子'];
const ABSTRACT_KW   = ['abstract','surreal','geometric','experimental','glitch',
                       'artistic','conceptual','fluid','pattern','textile','minimalist',
                       'creative','光影','创意','抽象','实验','几何','梦幻','超现实'];
const PRODUCT_KW    = ['product photography','smartphone','laptop','vr','headset',
                       'gadget','electronics','gaming setup','界面','产品摄影','电商'];
const FOOD_KW       = ['food','beverage','dessert','drink','coffee','restaurant',
                       'ramen','burger','chef','cuisine','美食','饮品','咖啡'];
const ARCH_KW       = ['architecture','interior','building','brutalist','room',
                       'scandinavian','furniture','apartment','空间','室内','建筑'];

function countKwMatches(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter(kw => {
    if (kw.includes('.*')) return new RegExp(kw, 'i').test(text);
    return lower.includes(kw.toLowerCase());
  }).length;
}

function inferCategory(promptText) {
  const t = promptText || '';

  const portraitScore   = countKwMatches(t, PORTRAIT_KW);
  const editorialScore  = countKwMatches(t, EDITORIAL_KW);
  const fashionScore    = countKwMatches(t, FASHION_KW) + countKwMatches(t, PRODUCT_KW);
  const landscapeScore  = countKwMatches(t, LANDSCAPE_KW) + countKwMatches(t, FOOD_KW) + countKwMatches(t, ARCH_KW);
  const streetScore     = countKwMatches(t, STREET_KW);
  const abstractScore   = countKwMatches(t, ABSTRACT_KW);

  const best = Math.max(portraitScore, editorialScore, fashionScore, landscapeScore, streetScore, abstractScore);
  if (best === 0) return 'Abstract';

  if (portraitScore  === best) return 'Portrait';
  if (landscapeScore === best) return 'Landscape';
  if (fashionScore   === best) return 'Fashion';
  if (editorialScore === best) return 'Editorial';
  if (streetScore    === best) return 'Street';
  return 'Abstract';
}

// ─── Step 1: Add category column if missing ───────────────────────────────────
console.log('\n── Step 1: Ensure category column exists ──');
const existingCols = new Set(db.prepare('PRAGMA table_info(gen_history)').all().map(r => r.name));
if (!existingCols.has('category')) {
  db.exec("ALTER TABLE gen_history ADD COLUMN category TEXT NOT NULL DEFAULT 'Abstract'");
  console.log('  → Added category column');
} else {
  console.log('  → Column already exists');
}

// ─── Step 2: Stats before ─────────────────────────────────────────────────────
const uncategorized = db.prepare("SELECT COUNT(*) as c FROM gen_history WHERE category IS NULL OR category = ''").get().c;
const total = db.prepare('SELECT COUNT(*) as c FROM gen_history').get().c;
console.log(`\n── Step 2: gen_history stats ──`);
console.log(`  Total rows:     ${total}`);
console.log(`  Uncategorised:  ${uncategorized}`);

// ─── Step 3: Infer & update all rows ─────────────────────────────────────────
console.log('\n── Step 3: Categorising all rows ──');

const allRows = db.prepare('SELECT id, prompt FROM gen_history').all();
const before = Date.now();
let updated = 0;

const updateStmt = db.prepare('UPDATE gen_history SET category = ? WHERE id = ?');
const tx = db.transaction(() => {
  for (const row of allRows) {
    const cat = inferCategory(row.prompt);
    updateStmt.run(cat, row.id);
    updated++;
    if (updated % 50 === 0) process.stdout.write(`  ${updated}/${allRows.length}... `);
  }
});
tx();

console.log(`\n  → Categorised ${updated} rows in ${Date.now() - before}ms`);

// ─── Step 4: Verify ────────────────────────────────────────────────────────────
console.log('\n── Step 4: Verification ──');
const catCounts = db.prepare('SELECT category, COUNT(*) as c FROM gen_history GROUP BY category ORDER BY c DESC').all();
console.log('  Category distribution:');
for (const r of catCounts) console.log(`    ${r.category}: ${r.c}`);

const stillEmpty = db.prepare("SELECT COUNT(*) as c FROM gen_history WHERE category IS NULL OR category = ''").get().c;
console.log(`\n  Empty categories: ${stillEmpty}`);

if (stillEmpty === 0) {
  console.log('\n✅ All gen_history rows categorised.');
} else {
  console.log('\n⚠️  Some rows still uncategorised — check errors above.');
}

// ─── Step 5: Vacuum ────────────────────────────────────────────────────────────
console.log('\n── Step 5: Vacuum ──');
db.exec('VACUUM');
console.log('  → Done');

db.close();
console.log('\n🎯 gen_history is now categorised. Run: node server/index.js');
