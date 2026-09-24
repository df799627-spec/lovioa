#!/usr/bin/env node
/**
 * bulk-approve-all.js
 *
 * 一键将所有 pending 状态的 gen_history 记录批量审核通过：
 * 1. 遍历所有 moderation_status = 'pending' 的行
 * 2. 对每行：inferCategoryAndTags() 推理分类标签
 * 3. 批量 INSERT INTO prompts（用事务，一次性提交）
 * 4. UPDATE gen_history moderation_status = 'approved'
 * 5. PRINT 统计结果
 *
 * 安全：先 dry-run 报告要处理的行数，确认无误后再真正执行（加 --confirm 参数）
 */
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE   = join(__dirname, 'data/lovioa.db');

const db = Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');

// ─── Category inference (same rules as promptsRepo.js) ─────────────────────────
const TAG_RULES = [
  { tag: 'Portrait', category: 'Portrait', re: /\bportrait|headshot|selfie|beauty|face|skin|profile|silhouette|lifestyle|human|woman|man|模特|写真|人像|人物|自拍|头像|棚拍/i },
  { tag: 'Fashion', category: 'Fashion', re: /\bfashion|lookbook|couture|runway|outfit|dress|shoe|leather|wardrobe|accessory|styling|garment|clothing|apparel|时尚|穿搭|服装|服饰/i },
  { tag: 'Editorial', category: 'Editorial', re: /\beditorial|magazine|cover|spread|vogue|elle|harper|glamour|campaign|advertising|大片|杂志|奢侈|品牌/i },
  { tag: 'Landscape', category: 'Landscape', re: /\blandscape|mountain|forest|sea|ocean|sunset|sunrise|nature|sky|cloud|water|beach|river|meadow|valley|horizon|park|jungle|desert|canyon|glacier|aerial|风景|海|山|日落|日出|森林|沙漠|自然/i },
  { tag: 'Street', category: 'Street', re: /\bstreet|urban|city|neon|alley|downtown|metro|subway|sidewalk|pavement|rooftop|cityscape|lantern|night.*city|街头|城市|霓虹|巷子/i },
  { tag: 'Abstract', category: 'Abstract', re: /\babstract|surreal|geometric|experimental|glitch|artistic|conceptual|fluid|pattern|textile|minimalist|creative|光影|创意|抽象|实验|几何|梦幻|超现实/i },
  { tag: 'Product', category: 'Fashion', re: /\bproduct photography|smartphone|laptop|vr|headset|gadget|electronics|gaming setup|ui design|界面|产品摄影|电商/i },
  { tag: 'Food', category: 'Landscape', re: /\bfood|beverage|dessert|drink|coffee|restaurant|ramen|burger|chef|cuisine|美食|饮品|咖啡/i },
  { tag: 'Architecture', category: 'Landscape', re: /\barchitecture|interior|building|brutalist|room|scandinavian|furniture|apartment|空间|室内|建筑/i },
];

function inferCategoryAndTags(promptText = '') {
  const text = String(promptText || '');
  const tags = [];
  const categoryScores = {};
  for (const rule of TAG_RULES) {
    if (rule.re.test(text)) {
      if (!tags.includes(rule.tag)) tags.push(rule.tag);
      categoryScores[rule.category] = (categoryScores[rule.category] || 0) + 1;
    }
  }
  // Score-based category selection: highest wins
  const order = ['Portrait', 'Editorial', 'Fashion', 'Landscape', 'Street', 'Abstract'];
  let bestCat = 'Abstract', bestScore = 0;
  for (const cat of order) {
    if ((categoryScores[cat] || 0) > bestScore) {
      bestScore = categoryScores[cat];
      bestCat = cat;
    }
  }
  return {
    category: bestCat,
    tags: tags.length ? tags.slice(0, 8) : ['Generated'],
  };
}

// ─── Stats before ─────────────────────────────────────────────────────────────
const pending = db.prepare("SELECT COUNT(*) as c FROM gen_history WHERE moderation_status = 'pending'").get().c;
const approved = db.prepare("SELECT COUNT(*) as c FROM gen_history WHERE moderation_status = 'approved'").get().c;
const rejected = db.prepare("SELECT COUNT(*) as c FROM gen_history WHERE moderation_status = 'rejected'").get().c;
console.log('=== 批量审核通过脚本 ===\n');
console.log('当前状态:');
console.log('  pending:  ', pending);
console.log('  approved: ', approved);
console.log('  rejected: ', rejected);

if (pending === 0) {
  console.log('\n没有待审核的记录，退出。');
  db.close();
  process.exit(0);
}

// ─── Preview: show category distribution of pending items ───────────────────
console.log('\npending 项目分类预览:');
const preview = db.prepare("SELECT category, COUNT(*) as c FROM gen_history WHERE moderation_status = 'pending' GROUP BY category ORDER BY c DESC").all();
preview.forEach(r => console.log('  ' + r.category.padEnd(12) + ': ' + r.c));

// Check if --confirm flag passed
const args = process.argv.slice(2);
const dryRun = !args.includes('--confirm');
if (dryRun) {
  console.log('\n⚠️  Dry-run 模式（加 --confirm 正式执行）');
  console.log('将把 ' + pending + ' 条 pending 记录批量审核通过并写入 prompts 表。');
  db.close();
  process.exit(0);
}

// ─── Execute: bulk approve all pending ───────────────────────────────────────
console.log('\n正在批量审核通过...');

const allPending = db.prepare("SELECT gh.*, p.id as prompt_id FROM gen_history gh LEFT JOIN prompts p ON p.id = 'gen-' || gh.id WHERE gh.moderation_status = 'pending'").all();
console.log('查询到 pending 记录:', allPending.length);

let inserted = 0;
let skipped = 0;
const catStats = {};
const before = Date.now();

const insertPrompt = db.prepare(`
  INSERT INTO prompts (
    id, image_url, prompt, author_name, author_avatar, author_prompt_count,
    author_user_id, tags_json, category, likes, liked, saved, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
`);

const tx = db.transaction(() => {
  for (const row of allPending) {
    const inferred = inferCategoryAndTags(row.prompt || '');
    const finalCat = row.category || inferred.category;
    catStats[finalCat] = (catStats[finalCat] || 0) + 1;

    if (!row.prompt_id) {
      // Not yet in prompts table — insert it
      const promptsId = 'gen-' + row.id;
      insertPrompt.run(
        promptsId,
        row.image_url,
        row.prompt || '',
        'Lovioa',
        'https://api.dicebear.com/7.x/miniavs/svg?seed=pf',
        0,
        row.user_id || null,
        JSON.stringify(inferred.tags),
        finalCat,
        row.created_at,
      );
      inserted++;
    } else {
      skipped++;
    }
  }
  // Mark all as approved
  db.prepare("UPDATE gen_history SET moderation_status = 'approved' WHERE moderation_status = 'pending'").run();
});

tx();

console.log('\n执行完成 (' + (Date.now() - before) + 'ms):');
console.log('  新插入 prompts 表:', inserted);
console.log('  已在 prompts 表（跳过）:', skipped);
console.log('\n分类分布:');
for (const [cat, c] of Object.entries(catStats).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + cat.padEnd(12) + ': ' + c);
}

db.close();
console.log('\n✅ 全部 ' + inserted + ' 条已审核通过并进入 prompts 表。');
console.log('   服务重启后生效: node server/index.js');
