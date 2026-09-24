#!/usr/bin/env node
/**
 * Enqueue game asset prompts TAILORED for sliceability.
 * Sprite sheets, tilesets, transparent PNG sprites, modular components, etc.
 * Run: node enqueue-game-prompts-slicable.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const gamePrompts = [
  // ── Sprite Sheets (animation frames in grid) ──────────────────────────────
  ['text', 'Pixel art sprite sheet, a small forest elf character walking animation, 8 frames in a horizontal row, top-down 2D game perspective, 16x16 pixel sprites with outline, transparent background, green forest palette, no shading — clean flat color areas only'],
  ['text', 'Pixel art sprite sheet, a cute knight character idle animation, 6 frames loop, side-view walking cycle, 32x32 pixels per frame, clean outlines, transparent background, warm armor palette of brown and silver, 8-frame horizontal strip'],
  ['text', 'Pixel art sprite sheet, a small slime enemy bouncing animation, 4 frames, squish and stretch, 16x16 pixels, bright green with darker green shading, transparent background, cute round blob style, game-ready sprite sheet layout'],
  ['text', 'Pixel art sprite sheet, a warrior character attack animation with sword swing, side view, 8 frames in a row, 32x32 pixels, transparent background, dark knight armor with red cape, impactful motion poses, clean outlines, RPG Maker style'],
  ['text', 'Pixel art sprite sheet, an old wizard character casting spell animation, 8-frame loop, side view, 32x32 pixels per frame, purple robes, blue magical aura expanding, transparent background, detailed but game-safe sprite sheet'],
  ['text', 'Pixel art sprite sheet, a tiny goblin enemy with dagger, 6-frame walk cycle, top-down view, 16x16 pixels, transparent background, olive green skin, brown rags, big ears, comical angry expression, clean pixel art'],

  // ── Tilesets (modular grid tiles for building scenes) ──────────────────────
  ['text', 'Pixel art tileset for 2D forest game, a grid of 16x16 pixel tiles on dark background: grass tiles (flat, edge, corner variants), dirt path tiles, tree trunk base, stone rock, flower patch, dead tree stump, mushroom cluster — all with transparent background, consistent 16x16 grid, NES-era color palette'],
  ['text', 'Pixel art tileset for dungeon crawler game, 16x16 pixel grid tiles: stone floor variations (flat, cracked, mossy), stone wall tiles (top, middle, bottom with and without cracks), iron gate tile, torch sconce, puddle of water, broken pillar, all on transparent background, dark grey stone palette with warm torch lighting'],
  ['text', 'Pixel art tileset for isometric city building game, 64x64 pixel isometric tiles on transparent background: cobblestone road flat tile, tall stone building corner tile, building wall tile with window, roof tile, wooden crate stack, market stall awning, cobblestone corner, isometric grass tile, medieval European town aesthetic'],
  ['text', 'Pixel art tileset for underwater ocean game, 16x16 pixel grid tiles: sandy ocean floor, coral cluster, sea grass, bubble stream, treasure chest closed, skull on sand, seaweed, pearl oyster, kelp strand, blue-green ocean palette, transparent background, clean outlines'],
  ['text', 'Pixel art tileset for medieval tavern interior, 16x16 pixel grid: wooden plank floor, stone wall lower section, wooden wall upper, bar counter top-view, mug tankard, loaf of bread, candle in holder, wine barrel, hanging copper pot, warm orange candlelight palette, transparent BG'],

  // ── Character Parts (separated, easy to swap/combine) ────────────────────
  ['text', 'Pixel art character customisation sheet for RPG, a grid layout showing all swapable parts on transparent background: 6 face variants (happy, neutral, angry, surprised, sad, smug), 4 hair styles (short, long, ponytail, bald), 4 body/armor types (cloth robe, light leather, heavy plate, mage robes), all 32x32, clean flat pixel art, warm earth palette'],
  ['text', 'Pixel art character equipment slots sheet, a dark grid showing separate transparent PNG slots for a medieval warrior: bare chest base body, leather chest armor, chainmail torso, plate armor chest, 4 helmet variants (none, open helm, full helm, hood), sword held at side, shield, all in one 64x64 reference image with labeled zones'],
  ['text', 'Pixel art NPC heads sheet, 8 distinct NPC faces in a horizontal row, 24x24 pixels each, all on transparent background: old merchant man, young female healer, stern guard, child, elderly woman, bearded blacksmith, hooded mysterious stranger, laughing innkeeper — all different skin tones and expressions'],
  ['text', 'Pixel art weapon sprite pack, multiple weapons arranged in labeled zones on transparent background: iron short sword (5 angles from handle to tip), wooden bow, steel axe head, dagger, wooden staff, wand with glowing tip, each weapon clearly separated, 16x16 pixel grid alignment, grey-steel and brown palette'],

  // ── UI Components (isolated, reassemblable) ───────────────────────────────
  ['text', 'Pixel art game UI sprite sheet, a collection of clean separated UI elements on transparent background: 5 heart icons in full-to-empty states (green health), 3 coin/gem icons, 4 button shapes (square, round, diamond, shield), 3 inventory slot frames, 2 scroll borders, pixel art style, 16x16 grid aligned, warm gold and brown palette'],
  ['text', 'Pixel art equipment icons sheet, 12 item icons in a 4x3 grid, each 16x16 on transparent background: iron helmet, leather boots, wooden shield, steel sword, magic scroll, health potion, key, torch, gold coin stack, map scroll, ring, amulet — clean flat pixel art, warm item game aesthetic, dark outlines'],
  ['text', 'Pixel art HUD elements sheet, separated transparent HUD parts: 3 heart icons, 2 heart container frames, coin counter box, XP bar background, XP bar fill, level-up star burst, 3 button variants, all in consistent 16x16 pixel size, clean outlines, RPG Maker compatible style'],
  ['text', 'Pixel art minimap icons, 8 small location icons in a row on transparent background, 8x8 pixels each: player arrow, chest marker, NPC question mark, enemy skull, boss star, shop coin, dungeon spiral, exit door — bright distinctive colors on small scale, readable even when scaled down'],

  // ── Transparent Object Sprites (isolated, ready to use) ──────────────────
  ['text', 'Pixel art collectible items sprite pack, 8 separated items on transparent background, each 16x16: a glowing golden key, red ruby gem, blue sapphire, stack of gold coins, rolled parchment with seal, mysterious glowing orb, potion bottle with green liquid, ancient rune stone — all with slight glow effect, flat pixel art'],
  ['text', 'Pixel art interactive world objects, 6 isolated items on transparent background, 16x16 each: wooden treasure chest closed, open treasure chest with gold pile, pushable boulder, climbable rope, wooden ladder, iron door closed, dark dungeon palette with warm torchlight glow, clean outlines, top-down 2D perspective'],
  ['text', 'Pixel art food and consumables, 8 items on transparent background, 16x16 each: red apple, bread loaf, leg of ham, grilled fish, cheese wedge, carrot, mushroom, cooked meat on bone — bright appetizing colors, clean flat pixel art style, consistent size and perspective'],
  ['text', 'Pixel art decorative objects for outdoor scenes, 8 items on transparent background, 16x16 each: wooden signpost, stone well, flower bouquet, wooden fence segment, campfire with flames, tent, barrel, wooden crate — earth and forest color palette, clean flat style, transparent BG'],

  // ── Enemies / Mobs (separated for animation layering) ─────────────────────
  ['text', 'Pixel art slime enemy animation sprite sheet, 4-frame bounce animation in a 4x1 horizontal strip, 16x16 pixels per frame, bright lime green body, darker green inner shading for depth, simple cute design, transparent background, squash and stretch animation principles'],
  ['text', 'Pixel art skeleton enemy character sheet, front-view skeleton with separate bone layers on transparent background: skull head, ribcage body, arms with weapon attachment point, legs with walk cycle, glowing red eye dots, 32x32, dark white bone with blue magic glow highlights, Dark Souls game asset style'],
  ['text', 'Pixel art flying enemy sprite sheet, a bat creature with 4-frame wing flap animation, 16x16 pixels, dark purple-black body, red eye dots, wings spread wide, top-down game perspective, transparent background, 4-frame loop suitable for 2D side-scroller'],
  ['text', 'Pixel art slime boss enemy, large version 32x32, 4-frame animation: idle wobble, attack anticipation squash, attack expansion, return — green translucent jelly body with darker green core showing through, small white highlight dots, cute but menacing expression, transparent BG'],

  // ── Isometric / Top-down modular assets ──────────────────────────────────
  ['text', 'Isometric pixel art floor tiles, 3 variations in a row on transparent background, 64x32 diamond shape each: clean cobblestone floor, cobblestone with moss growing in cracks, cracked cobblestone with gap — warm grey stone palette, consistent isometric perspective, game-ready edges'],
  ['text', 'Isometric pixel art wall tiles, 3 variations showing wall height progression, 64x64 isometric: 1-tile-low wall, 2-tiles-high wall, 2-tiles-high with window opening, grey stone brick texture, dark mortar lines, warm torchlight catching edges, transparent background, consistent isometric grid'],
  ['text', 'Top-down RPG map tileset, 16x16 pixel tiles on transparent background: grass tile, dirt path, stone floor, wooden floor, water edge tiles (top, left, right, bottom), water with animated surface shimmer — green/brown/blue palette, clean tile borders for seamless tiling, classic 2D RPG Maker style'],

  // ── Effects / VFX sprites ─────────────────────────────────────────────────
  ['text', 'Pixel art magic spell effects sprite sheet, 6 spell animations on transparent background: fireball projectile (4 frames), ice shard (4 frames), lightning bolt strike (4 frames), healing glow (4 frames), poison cloud (4 frames), sparkly teleport (4 frames), each 16x16, vibrant game spell colors, 24-frame horizontal strip'],
  ['text', 'Pixel art explosion and impact effects, 3 separate effect sprites: a simple starburst impact (3 frames), a circular smoke puff (3 frames), a ground crack pattern — all on transparent background, 16x16 each, warm orange/red/yellow for impact, grey for smoke, clean pixel art VFX style'],
  ['text', 'Pixel art ambient particle effects sprite sheet, horizontal strip of looping background effects: falling leaves (4 frames), drifting snowflakes (4 frames), falling rain (4 frames), floating pollen dust (4 frames), all 16x16, transparent background, subtle soft pixel style, top-down game perspective'],
];

console.log(`准备入队 ${gamePrompts.length} 条可拆图游戏提示词...\n`);

const insert = db.prepare(`
  INSERT INTO gen_jobs
    (id, user_id, mode, model, size, quality, prompt, negative_prompt, reference_image_url, status, attempt_count, max_attempts, queued_at, created_at, updated_at)
  VALUES (?, NULL, ?, 'gpt-image-2', '1024x1024', 'medium', ?, '', NULL, 'queued', 0, 5, ?, ?, ?)
`);

const now = new Date().toISOString();
let added = 0;
let failed = 0;

for (const [mode, promptText] of gamePrompts) {
  const id = randomUUID();
  try {
    insert.run(id, mode, promptText, now, now, now);
    added++;
    console.log(`  + ${promptText.slice(0, 65)}...`);
  } catch (e) {
    failed++;
    console.log(`  x 失败: ${e.message}`);
  }
}

console.log(`\n成功入队: ${added} 条  |  失败: ${failed} 条`);

const queue = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs GROUP BY status").all();
console.log('\n=== 当前队列状态 ===');
queue.forEach(r => console.log(`  ${r.status}: ${r.c}`));

db.close();