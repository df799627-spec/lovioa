#!/usr/bin/env node
/**
 * Editor 两步批量处理脚本
 *
 * Phase 1: 入队 Step 1 任务（生成基础图）
 *   node editor-batch.js phase1
 *
 * Phase 2: 入队 Step 2 任务（基于 Step 1 结果进行编辑）
 *   node editor-batch.js phase2
 *
 * 完整流程:
 *   node editor-batch.js phase1
 *   # 启动服务器处理: node index.js (或已在运行)
 *   # 等待 Step 1 全部完成
 *   node editor-batch.js phase2
 *   # 服务器自动处理 Step 2
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

// ── Prompt pairs: [Step1 prompt, Step2 edit instruction] ─────────────────────
const PROMPT_PAIRS = [
  // Coser / Portrait 系列
  [
    'A beautiful young woman cosplaying as a cyberpunk character, neon-lit city background, dramatic lighting, intricate costume details, full body shot, ultra realistic photography',
    'Change the background to a snowy mountain landscape at sunset, keep the character exactly the same, cinematic lighting',
  ],
  [
    'A portrait of a woman in traditional Hanfu costume, ancient Chinese garden setting, soft natural light, porcelain skin, delicate embroidery, elegant pose',
    'Transform the costume to a modern red qipao, keep the same woman and pose, adjust the background to a Shanghai rooftop at night',
  ],
  [
    'A fantasy anime-style girl character, silver hair, blue eyes, white flowing dress, magical forest background with fireflies, ethereal atmosphere',
    'Change the character to a dark version with black hair and red eyes, background becomes a volcanic landscape with lava, dark fantasy style',
  ],
  [
    'A portrait of a cosplayer as a medieval knight in full armor, dramatic torchlight, stone castle interior, realistic metal textures',
    'Transform the knight armor into a gothic lolita dress, keep the castle setting, adjust lighting to moonlight',
  ],
  [
    'A young woman dressed as a witch, purple robes, cauldron bubbling, mystical forest clearing, floating candles, magical atmosphere, photorealistic',
    'Change the witch costume to a school uniform with a witch hat, background becomes a modern city at night with magic effects',
  ],

  // Beauty / Portrait 系列
  [
    'High-end beauty portrait of a woman with glass skin makeup, soft pink tones, cherry blossom petals falling around her, editorial fashion photography, Vogue style',
    'Change the makeup to bold red lipstick and dramatic smoky eye, petals become autumn maple leaves, darker moody editorial lighting',
  ],
  [
    'Cinematic portrait of a woman with wet hair, water droplets on skin, dark moody background, single key light from above, intense gaze, luxury beauty photography',
    'Transform to a bright outdoor scene with the same woman, wet hair glistening in sunlight, tropical beach background, fresh dewy look',
  ],
  [
    'A close-up beauty shot of a model with galaxy-themed makeup, stars and nebula painted on eyelids, iridescent highlighter, cosmic atmosphere, high fashion editorial',
    'Change the galaxy makeup to floral patterns, roses and peonies painted on face, spring garden background, romantic soft lighting',
  ],
  [
    'Beauty portrait of a woman with golden hour makeup, warm amber tones, soft focus, dreamy bokeh background, summer afternoon light, natural editorial',
    'Transform to night time beauty shot, same woman, blue moonlight makeup, city skyline background with neon reflections',
  ],
  [
    'Editorial beauty photograph of a model with avant-garde geometric makeup, bold colored shapes on face, studio spotlight, minimalist background, high fashion',
    'Change the geometric makeup to watercolor style patterns, soft pastel colors, outdoor natural background, editorial fashion',
  ],

  // Fashion / Editorial 系列
  [
    'Fashion editorial of a model in a flowing silk gown, dramatic wind, golden hour light, open field of tall grass, haute couture, cinematic',
    'Change the gown to a sleek black leather jacket and mini skirt, grass becomes a rainy city street at night, same model',
  ],
  [
    'A street style portrait of a fashion blogger in bold colorful layered outfits, urban alley background, natural street photography, candid editorial',
    'Transform to minimalist all-white outfit, background becomes a clean white studio, editorial fashion photography style',
  ],
  [
    'Luxury fashion campaign photograph, model in a Valentino red gown, grand palazzo interior, ornate chandelier, Italian luxury aesthetic, high-end editorial',
    'Change the gown to a casual luxury look with designer denim and white blouse, palace interior becomes an outdoor Mediterranean terrace',
  ],
  [
    'Avant-garde fashion photograph, model wearing a sculptural garment made of recycled metal pieces, industrial warehouse background, conceptual fashion',
    'Transform the metal garment to a soft flowing organic fabric in earth tones, warehouse becomes an art gallery, same artistic concept',
  ],
  [
    'Vintage fashion editorial, model in 1950s style Dior New Look dress, classic car background, retro Hollywood glamour, nostalgic warm color grading',
    'Transform to the same model in modern streetwear, classic car becomes a sports car, contemporary urban setting, modern retro fusion',
  ],

  // Nature / Landscape 系列
  [
    'A majestic mountain landscape at sunrise, golden light on snow-capped peaks, misty valley below, dramatic clouds, epic nature photography, ultra high resolution',
    'Transform the sunrise to a starry night sky, add a full moon illuminating the peaks, add subtle aurora borealis, keep the mountain the same',
  ],
  [
    'A Japanese zen garden in autumn, maple trees with red and gold leaves, perfect moss ground, stone lantern, koi pond, peaceful Japanese garden photography',
    'Change the season to spring, maples become cherry blossom trees, koi remain, add falling petals on water, softer pastel tones',
  ],
  [
    'An underwater coral reef scene, vibrant coral colors, schools of tropical fish, sunbeams piercing through water, crystal clear blue water, marine life photography',
    'Transform to a shipwreck scene on the same reef, add diving diver, keep the vibrant coral and fish, add mysterious underwater atmosphere',
  ],
  [
    'A field of lavender in Provence at sunset, rows stretching to the horizon, golden hour light, distant mountain silhouette, romantic French countryside, warm tones',
    'Change to a field of sunflowers at the same golden hour, same French countryside setting, vibrant yellow palette instead of purple',
  ],
  [
    'A misty bamboo forest in China, tall bamboo stalks disappearing into mist, ancient stone path, ethereal green light filtering through, zen atmosphere',
    'Transform to the same bamboo forest at night with bioluminescent mushrooms glowing, fireflies, magical fantasy atmosphere',
  ],

  // Architecture / Interior 系列
  [
    'The interior of a grand Art Deco theater, ornate gold ceiling with geometric patterns, red velvet seats, dramatic chandelier, 1920s glamour, cinematic lighting',
    'Transform the Art Deco theater to a modern minimalist Scandinavian interior, keep the same grand scale, white and wood tones, natural light',
  ],
  [
    'A cozy hygge-style living room, fireplace with warm flames, knitted blankets, candles everywhere, snow visible through frosted windows, Danish winter atmosphere',
    'Transform to a bright summer version of the same room, windows open to a sunlit garden, fresh flowers replace candles, light airy atmosphere',
  ],
  [
    'A modern luxury bathroom, freestanding marble bathtub, gold fixtures, large window overlooking ocean, minimalist elegant design, spa atmosphere',
    'Change the ocean view to a mountain landscape with hot spring steam rising, keep the same luxurious bathroom, add steamy mist atmosphere',
  ],
  [
    'A futuristic sci-fi interior of a spaceship bridge, holographic displays, curved screens, astronaut in the center, cosmic view through large windows, cinematic sci-fi',
    'Transform the spaceship bridge to a medieval throne room, same astronaut becomes a king, holographic screens become tapestries and banners, fantasy sci-fi fusion',
  ],
  [
    'A Moroccan riad courtyard, intricate tilework in blue and terracotta, central fountain, orange tree, carved stucco, afternoon light, exotic interior photography',
    'Transform to a Japanese ryokan interior, keep the courtyard structure but change to tatami mats, shoji screens, bonsai tree, Japanese aesthetic',
  ],

  // Food / Still Life 系列
  [
    'A dramatic food photograph of ramen in a dark ceramic bowl, steam rising, soft shadowy background, single dramatic light source from above, Japanese ramen shop aesthetic',
    'Change the ramen to a bright colorful poke bowl, same dramatic lighting style, add tropical fruits and flowers as garnish, vibrant food photography',
  ],
  [
    'A luxury still life of vintage champagne on ice in a crystal bucket, oysters on a bed of rock salt, candlelight dinner setting, elegant evening atmosphere',
    'Transform to a casual brunch setting with the same champagne in plastic cups, oysters become avocado toast, sunny outdoor breakfast, relaxed luxury',
  ],
  [
    'A moody coffee shop scene, espresso machine in focus, latte art, dark atmospheric interior, warm tungsten light, intimate coffee culture photography',
    'Transform to a bright minimalist specialty coffee bar, pour-over in focus, white marble counter, natural daylight, modern coffee culture aesthetic',
  ],
  [
    'A flat lay of Japanese bento box, rice, tempura, pickles, salmon, elegant presentation on black lacquered tray, minimalist Japanese food photography',
    'Change to a Mexican street food spread, tacos and guacamole, colorful vibrant presentation, rustic wooden surface, bold food photography',
  ],

  // Animal / Wildlife 系列
  [
    'A golden retriever portrait in soft morning light, dreamy bokeh background, puppy eyes looking directly at camera, warm golden tones, pet photography',
    'Transform the golden retriever to a white cat with the same sweet expression, same soft lighting, add a flower crown, feline portrait',
  ],
  [
    'A lion in the golden hour African savanna, golden light on mane, intense amber eyes, blurred golden grass background, majestic wildlife photography',
    'Transform to a snow leopard in Himalayan mountains at sunset, keep the majestic intense portrait style, white fur with grey spots, cold blue tones',
  ],
  [
    'An owl portrait in moonlight, detailed feather texture, large amber eyes, dark mysterious forest background, atmospheric wildlife photography',
    'Transform the owl to a colorful parrot in a tropical rainforest, same detailed portrait style, vibrant plumage, green and blue tones',
  ],
  [
    'A horse portrait in motion, running through shallow ocean water at sunset, mane and tail flowing, splash droplets frozen, dramatic action wildlife photography',
    'Transform to a zebra running through the same ocean sunset, keep the dramatic action, black and white stripes with golden sunset reflections',
  ],

  // Abstract / Creative 系列
  [
    'An abstract macro photograph of water droplets on a spider web at sunrise, dew drops catching rainbow light, intricate web geometry, extreme detail',
    'Transform the spider web to a geometric neon light installation, same macro perspective, cyberpunk neon colors, urban abstract photography',
  ],
  [
    'A surrealist fine art photograph, a human face with flowers blooming from the eyes and mouth, artistic portrait, soft natural lighting, dreamlike atmosphere',
    'Transform the flowers to butterflies emerging from the same face, keep the surrealist artistic portrait style, add a surrealist painted background',
  ],
  [
    'Double exposure fine art portrait, a woman\'s face merged with a forest landscape, black and white with selective color, artistic photography, gallery quality',
    'Transform to a double exposure merging the same woman with an ocean scene, waves instead of trees, selective teal and gold color, same artistic style',
  ],
  [
    'A long exposure light trail photography of a city highway at night, cars creating colorful light streaks, dramatic urban photography, motion blur art',
    'Transform the city highway to a mountain road at night, same light trail technique, fewer lights, starry sky above, serene night landscape',
  ],
];

// ── Helper ───────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();

// ── Phase 1: 入队 Step 1 任务 ────────────────────────────────────────────────
async function phase1() {
  console.log('\n=== Phase 1: 入队 Step 1 任务（生成基础图）===\n');
  console.log(`准备入队 ${PROMPT_PAIRS.length} 条 Step 1 提示词...\n`);

  // 去重：跳过已存在的 Step 1 prompts
  const existingPrompts = new Set(
    db.prepare("SELECT prompt FROM gen_jobs WHERE mode = 'text'").all().map(r => r.prompt.trim().toLowerCase())
  );
  const existingHistPrompts = new Set(
    db.prepare("SELECT prompt FROM gen_history WHERE mode = 'text'").all().map(r => r.prompt.trim().toLowerCase())
  );
  const allExisting = new Set([...existingPrompts, ...existingHistPrompts]);

  const newPairs = PROMPT_PAIRS.filter(([p1]) => !allExisting.has(p1.trim().toLowerCase()));

  console.log(`总 pairs: ${PROMPT_PAIRS.length} | 已存在: ${PROMPT_PAIRS.length - newPairs.length} | 新增: ${newPairs.length}`);

  if (newPairs.length === 0) {
    console.log('所有 Step 1 提示词已存在，跳过。');
    db.close();
    return;
  }

  const insert = db.prepare(`
    INSERT INTO gen_jobs
      (id, user_id, mode, model, size, quality, prompt, negative_prompt, reference_image_url, status,
       attempt_count, max_attempts, queued_at, created_at, updated_at,
       publish_to_prompts, source_channel, provider_name, latency_ms, is_heartbeat,
       heartbeat_run_id, heartbeat_kind, heartbeat_category, preferred_channel)
    VALUES (?, NULL, 'text', 'gpt-image-1', '1024x1024', 'high', ?, '', NULL,
            'queued', 0, 3, ?, ?, ?,
            1, 'editor-batch', 'openai', 0, 1, 'editor-batch-run', 'image', '', 'editor-batch')
  `);

  let added = 0;
  let skipped = 0;
  const ts = now();

  for (const [p1, p2] of newPairs) {
    // 用 p1 的前50字符做 tag
    const tag = p1.match(/^[^,]+/)[0].trim().slice(0, 50);
    try {
      insert.run(randomUUID(), p1, ts, ts, ts);
      console.log(`  + [Step1] ${tag}`);
      added++;
    } catch (e) {
      skipped++;
      console.log(`  x 失败: ${e.message}`);
    }
  }

  console.log(`\n✓ Phase 1 完成: 入队 ${added} 条 Step 1 任务${skipped > 0 ? `，失败 ${skipped} 条` : ''}`);

  // 显示队列状态
  const q = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs WHERE source_channel = 'editor-batch' GROUP BY status ORDER BY status").all();
  if (q.length > 0) {
    console.log('\n当前 editor-batch 队列:');
    q.forEach(r => console.log(`  ${r.status}: ${r.c}`));
  }

  const queued = db.prepare("SELECT COUNT(*) as c FROM gen_jobs WHERE status = 'queued' AND source_channel = 'editor-batch'").get().c;
  if (queued > 0) {
    console.log(`\n${queued} 条任务已在队列中等待处理。`);
    console.log('请确保服务器正在运行（node index.js）以处理这些任务。');
  }
}

// ── Phase 2: 入队 Step 2 任务（基于 Step 1 结果） ─────────────────────────────
async function phase2() {
  console.log('\n=== Phase 2: 入队 Step 2 任务（编辑基础图）===\n');

  // 找到最新的 Step 1 jobs（text mode，来自 editor-batch）
  // 这些 job 的 result_image_url 不为空
  const step1Jobs = db.prepare(`
    SELECT id, prompt, result_image_url, created_at
    FROM gen_jobs
    WHERE mode = 'text'
      AND status = 'succeeded'
      AND result_image_url IS NOT NULL
      AND result_image_url != ''
      AND source_channel = 'editor-batch'
    ORDER BY finished_at DESC
    LIMIT ?
  `).all(PROMPT_PAIRS.length);

  console.log(`找到 ${step1Jobs.length} 条成功的 Step 1 任务（最多 ${PROMPT_PAIRS.length} 条）\n`);

  if (step1Jobs.length === 0) {
    console.log('没有找到成功的 Step 1 任务。');
    console.log('请先运行 Phase 1 并确保服务器处理完成：');
    console.log('  node editor-batch.js phase1');
    console.log('  # 确保服务器运行: node index.js');
    console.log('  # 等待 Step 1 完成后再运行 Phase 2');
    db.close();
    return;
  }

  // 检查哪些 Step 1 prompts 已有对应的 Step 2 编辑任务
  // 方式：检查 Step 2 jobs 的 prompt 是否以 Step 1 prompt 为前缀
  const existingStep2 = new Set(
    db.prepare("SELECT prompt FROM gen_jobs WHERE mode = 'edit' AND source_channel = 'editor-batch'").all().map(r => r.prompt)
  );

  const toEnqueue = [];
  for (const [idx, [p1, p2]] of PROMPT_PAIRS.entries()) {
    // 找匹配的 Step 1 job
    const matchJob = step1Jobs.find(j => j.prompt.trim() === p1.trim());
    if (!matchJob) continue;

    // 检查是否已入队 Step 2
    if (existingStep2.has(p2.trim())) {
      console.log(`  ⊙ 跳过（已存在）: ${p2.slice(0, 50)}...`);
      continue;
    }

    toEnqueue.push({
      p1: p1.trim(),
      p2: p2.trim(),
      step1Job: matchJob,
    });
  }

  console.log(`需要入队: ${toEnqueue.length} 条 Step 2 任务\n`);

  if (toEnqueue.length === 0) {
    console.log('所有 Step 2 任务已入队或无匹配的 Step 1 结果。');
    db.close();
    return;
  }

  const insert = db.prepare(`
    INSERT INTO gen_jobs
      (id, user_id, mode, model, size, quality, prompt, negative_prompt, reference_image_url, status,
       attempt_count, max_attempts, queued_at, created_at, updated_at,
       publish_to_prompts, source_channel, provider_name, latency_ms, is_heartbeat,
       heartbeat_run_id, heartbeat_kind, heartbeat_category, preferred_channel)
    VALUES (?, NULL, 'edit', 'gpt-image-1', '1024x1024', 'high', ?, '', ?, 'queued',
            0, 3, ?, ?, ?,
            1, 'editor-batch', 'openai', 0, 1, 'editor-batch-run', 'image', '', 'editor-batch')
  `);

  let added = 0;
  const ts = now();

  for (const { p1, p2, step1Job } of toEnqueue) {
    const tag = p2.match(/^[^,]+/)[0].trim().slice(0, 50);
    try {
      insert.run(randomUUID(), p2, step1Job.result_image_url, ts, ts, ts);
      console.log(`  + [Step2] ${tag}`);
      console.log(`      ← 参考: ${step1Job.result_image_url.slice(0, 80)}...`);
      added++;
    } catch (e) {
      console.log(`  x 失败: ${e.message}`);
    }
  }

  console.log(`\n✓ Phase 2 完成: 入队 ${added} 条 Step 2 编辑任务`);

  const q = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs WHERE source_channel = 'editor-batch' GROUP BY status ORDER BY status").all();
  if (q.length > 0) {
    console.log('\n当前 editor-batch 队列:');
    q.forEach(r => console.log(`  ${r.status}: ${r.c}`));
  }

  const queued = db.prepare("SELECT COUNT(*) as c FROM gen_jobs WHERE status = 'queued' AND source_channel = 'editor-batch'").get().c;
  if (queued > 0) {
    console.log(`\n${queued} 条任务已在队列中等待处理。`);
    console.log('请确保服务器正在运行（node index.js）以处理这些任务。');
  }
}

// ── 状态查看 ─────────────────────────────────────────────────────────────────
function status() {
  console.log('\n=== Editor Batch 队列状态 ===\n');
  const all = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs WHERE source_channel = 'editor-batch' GROUP BY status ORDER BY status").all();
  if (all.length === 0) {
    console.log('暂无 editor-batch 任务');
  } else {
    all.forEach(r => console.log(`  ${r.status}: ${r.c}`));
  }

  // Step 1 vs Step 2
  const step1 = db.prepare("SELECT COUNT(*) as c FROM gen_jobs WHERE mode = 'text' AND source_channel = 'editor-batch'").get().c;
  const step2 = db.prepare("SELECT COUNT(*) as c FROM gen_jobs WHERE mode = 'edit' AND source_channel = 'editor-batch'").get().c;
  console.log(`\n  Step 1 (text): ${step1} 条`);
  console.log(`  Step 2 (edit): ${step2} 条`);

  db.close();
}

// ── Main ─────────────────────────────────────────────────────────────────────
const cmd = process.argv[2] || 'status';

switch (cmd) {
  case 'phase1':
    await phase1();
    break;
  case 'phase2':
    await phase2();
    break;
  case 'status':
    status();
    break;
  default:
    console.log('用法:');
    console.log('  node editor-batch.js phase1   # 入队 Step 1 任务');
    console.log('  node editor-batch.js phase2   # 入队 Step 2 任务（需 Step 1 完成）');
    console.log('  node editor-batch.js status   # 查看队列状态');
}
