#!/usr/bin/env node
/**
 * Enqueue a large batch of slicable game assets for game developers.
 * Covers: characters, tilesets, enemies, UI, objects, vehicles, VFX, etc.
 * Run: node enqueue-game-dev-assets.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const prompts = [
  // ── Character Sprites (walk cycles, attacks, classes) ─────────────────────
  ['text', 'Pixel art sprite sheet, a female elf ranger walking animation, 8 frames in horizontal strip, side-view, 32x32 pixels, transparent background, green and brown forest colors, bow held at side, pointed ears visible, D&D style character sheet'],
  ['text', 'Pixel art sprite sheet, a male barbarian character walking cycle, 8 frames, side view, 32x32 pixels, transparent background, brown leather harness over bare torso, huge greataxe on back, wild long hair, classic barbarian proportions, isometric-friendly'],
  ['text', 'Pixel art sprite sheet, a young male paladin in shining silver armor, idle animation 6 frames, 32x32 pixels, side view, transparent background, white tabard with blue cross emblem, sword and kite shield held ready, noble expression'],
  ['text', 'Pixel art sprite sheet, a female dark assassin in black cloak, stealth walk cycle 8 frames, 32x32, side view, transparent background, hood shadows face, dual daggers at hips, purple-black color scheme, ninja stealth game style'],
  ['text', 'Pixel art sprite sheet, a male old sage wizard character, casting spell animation 8 frames, 32x32, side view, transparent background, long grey beard, deep purple robes with constellation embroidery, glowing blue staff, magical particle aura'],
  ['text', 'Pixel art sprite sheet, a small goblin character, confused walk cycle 6 frames, 16x16, side view, transparent background, big yellow eyes, small hunched body, torn brown cloth, holding a rusty dagger, comical but menacing'],
  ['text', 'Pixel art sprite sheet, a heroic male blacksmith NPC, hammering animation 6 frames, 32x32, side view, transparent background, leather apron, muscular arms, large hammer striking anvil, sparks flying, warm firelight colors'],
  ['text', 'Pixel art sprite sheet, a cute fairy companion character, floating idle animation 4 frames with wings flapping, 16x16, transparent background, iridescent wings, small round body, glowing halo above head, pastel color palette, friendly game style'],
  ['text', 'Pixel art sprite sheet, a male pirate captain character, swagger walk cycle 8 frames, 32x32, side view, transparent background, tricorn hat, long coat with gold trim, flintlock pistol at belt, wooden leg visible, bold cartoon style'],
  ['text', 'Pixel art sprite sheet, a female druid in mossy robes, walk cycle 8 frames, 32x32, side view, transparent background, leaf-patterned green robes, wild hair with twigs, staff topped with gnarled wood, earthen forest palette'],

  // ── Tilesets (every major game biome) ─────────────────────────────────────
  ['text', 'Pixel art tileset for a medieval castle interior, 16x16 pixel grid tiles: stone floor tiles, cracked stone floor, mossy stone floor, castle wall lower stone, castle wall upper with banner bracket, wooden door closed, portcullis gate, torch sconce on wall, iron chandelier, stained glass window — all on transparent BG, grey stone and warm torch palette'],
  ['text', 'Pixel art tileset for a swamp and marsh biome, 16x16 pixel grid: murky dark green water edge tiles (4 directional), water with lily pads, murky water with气泡, dirt mud path, gnarled twisted dead tree, tall cattail reeds, moss-covered rock, quicksand patch, wooden walkway plank over water, swamp palette of dark greens and muddy browns, transparent BG'],
  ['text', 'Pixel art tileset for a winter snowy mountain environment, 16x16 pixel tiles: snow-covered ground, snow with footprints, ice patch (slightly blue), frozen lake edge, pine tree snow-covered, bare winter tree, wooden cabin wall, smoking chimney, frozen chest, icicle drip — white blue cold palette, transparent BG'],
  ['text', 'Pixel art tileset for a volcanic lava cave environment, 16x16 pixel tiles: cracked obsidian floor, hot lava pool edge, cooling lava (dark red), volcanic rock pile, stalactite dripping lava, iron ore vein in rock, charred dead tree, safety rune marker on floor, magma crack in ground — red black orange hot palette, transparent BG'],
  ['text', 'Pixel art tileset for a desert and oasis environment, 16x16 pixel tiles: fine sand dune, hard-packed sand path, cracked dry earth, stone temple floor, palm tree single, palm cluster, oasis water edge, tent canvas shade, treasure chest in sand, skull and bones in sand — warm sand orange and blue oasis water, transparent BG'],
  ['text', 'Pixel art tileset for a dark night city street environment, 16x16 pixel tiles: cobblestone road wet with rain, puddle reflecting light, stone sidewalk, brick building wall with window, hanging signboard, street lamp post with warm glow, trash can, open manhole cover, wet cobblestone with light reflection — dark blue and warm amber palette, transparent BG'],
  ['text', 'Pixel art tileset for a magical crystal cave, 16x16 pixel tiles: smooth dark stone floor, crystal cluster floor deposit, glowing magenta crystal formation, glowing cyan crystal formation, purple amethyst geode, dark crystal wall section, magical runes carved into rock, underground pool still water, glowing mushroom cluster — purple cyan magenta neon glow palette, transparent BG'],
  ['text', 'Pixel art tileset for a farm and village exterior, 16x16 pixel tiles: tilled farmland soil, farmland with crop rows, ripe wheat field, wooden fence post, fence rail segment, hay bale, scarecrow, well with bucket, rooster, barn door closed — warm sunny brown and green palette, transparent BG'],

  // ── Enemies & Monsters (classic RPG bestiary) ─────────────────────────────
  ['text', 'Pixel art sprite sheet, a giant spider enemy character, 6-frame idle crawling animation, 32x32, side view, transparent background, black body with purple markings, 8 articulated legs, red compound eyes, holding web between front legs, dark dungeon atmosphere'],
  ['text', 'Pixel art sprite sheet, a flame elemental enemy, 4-frame flicker animation, 32x32, transparent background, humanoid body made of orange-yellow fire, blue-hot core, rising embers, flames licking upward, warm fire palette, dark background silhouette'],
  ['text', 'Pixel art sprite sheet, a water elemental enemy, 4-frame idle slosh animation, 32x32, transparent background, teal blue translucent watery body, dark blue core, dripping water particles, flowing motion, cool blue palette'],
  ['text', 'Pixel art sprite sheet, a zombie enemy character, 6-frame shamble walk cycle, 32x32, side view, transparent background, tattered green-grey clothing, rotting flesh tones, one arm extended forward, exposed bone on ribs, red glowing eyes, classic zombie shamble'],
  ['text', 'Pixel art sprite sheet, a ghost enemy spirit, 4-frame float animation with trailing effect, 32x32, transparent background, translucent white-blue ghostly figure, hollow dark eye sockets, tattered shroud, wispy tail trailing below, spooky ethereal look'],
  ['text', 'Pixel art sprite sheet, a goblin shaman enemy, 6-frame casting spell animation, 32x32, side view, transparent background, green skin, tattered shamanic robes, holding a bone staff with glowing green orb, hunched posture, magic circles under feet'],
  ['text', 'Pixel art sprite sheet, a golem stone enemy, 2-frame heavy stomp walk, 32x32, side view, transparent background, rough grey stone body, glowing orange rune in chest, cracks with moss, dust particles kicking up, heavy mechanical movement feel'],
  ['text', 'Pixel art sprite sheet, a reaper enemy boss, 6-frame scythe swing attack, 32x32, side view, transparent background, hooded black robe, skeletal hands gripping a massive curved scythe blade, red glowing eyes in shadow hood, dark purple-black aura, Dark Souls boss feel'],
  ['text', 'Pixel art sprite sheet, a bee swarm enemy group, 5-frame buzzing horizontal movement, 16x16 per bee, transparent background, black and yellow striped body, transparent wings blurred, 4 bees in formation, menacing swarm behavior, 2D platformer enemy'],
  ['text', 'Pixel art sprite sheet, a mushroom monster enemy, 4-frame idle sway animation, 16x16, top-down view, transparent background, red-capped mushroom with white spots, cute but poisonous expression, tiny legs underneath, RPG Maker slime-style but mushroom variant'],

  // ── Game UI (separated, game-engine-ready) ─────────────────────────────────
  ['text', 'Pixel art dialogue box UI template, 3 elements separated on transparent background: main dialogue box frame with ornate gold border, character name plate header, continue arrow indicator blinking — all 320x64 area, retro RPG Maker dialogue feel, warm parchment brown and gold color, clean pixel art style'],
  ['text', 'Pixel art inventory grid UI elements, separated pieces on transparent background: inventory slot frame 24x24, equipped item slot highlight border, item quantity number badge (x1, x99 style), Rarity border color strips (green common, blue rare, purple epic, orange legendary), all in consistent pixel UI style'],
  ['text', 'Pixel art skill bar UI elements, 3 separated slots on transparent background: skill icon slot frame with warm gradient fill, skill cooldown overlay dark sweep, skill hotkey letter badge in corner (Q W E R style), empty slot vs filled slot variants, dark grey and warm orange palette, consistent pixel art HUD'],
  ['text', 'Pixel art minimap panel UI, separated elements on transparent background: compass rose for directions, player position arrow marker, explored area fog of war tile, unexplored solid black tile, chest marker icon, boss lair marker, NPC speech bubble icon — all 8x8 icons in a row, readable at small scale'],
  ['text', 'Pixel art game title screen UI elements, separated on transparent background: ornate game logo frame, PLAY button highlighted, OPTIONS button, CREDITS button, SELECT FILE slot indicators, pixel art version of each button in both normal and highlighted state, gold and dark purple palette'],
  ['text', 'Pixel art notification and popup UI elements, 4 separated on transparent BG: level up fanfare banner, item pickup notification panel, achievement unlock badge, damage numbers floating popup (3 sizes: critical, normal, miss) — each 32x32 area, bold readable pixel art, warm gold/orange palette'],

  // ── Interactive Objects & World Props ──────────────────────────────────────
  ['text', 'Pixel art interactive world objects pack, 8 separated items 16x16 each on transparent background: wooden pushable boulder, climbable rope hanging from ceiling, wooden ladder rungs, iron gate lever switch in off position, iron gate lever switch in on position, cracked breakable wall, hidden secret door, treasure chest open with gold pile — all isolated, easy to extract'],
  ['text', 'Pixel art crafting station objects, 4 stations 32x32 each on transparent background: a blacksmith anvil on stone base, an alchemy workbench with bubbling cauldron, a loom and weaving station, an enchantment table with glowing runes — each clearly separated, warm firelight and cool magic glow colors, side-view, RPG Maker compatible'],
  ['text', 'Pixel art storage and containers, 6 items 16x16 each on transparent BG: wooden barrel with lid, wooden crate nailed shut, open crate revealing contents, treasure chest closed with keyhole, treasure chest open empty, treasure chest open with gold coins — dungeon loot aesthetic, warm brown wood palette'],
  ['text', 'Pixel art NPC interaction markers, 4 separated sprites on transparent BG: exclamation mark (green, quest available), question mark (yellow, conversation), exclamation mark (red, urgent/combat), down arrow (blue, shop/trade) — each 16x16, blinking animation 2-frame, classic JRPG interaction indicator style'],
  ['text', 'Pixel art dungeon traps, 6 items 16x16 each on transparent BG: spike trap raised, spike trap triggered (retracted), swinging pendulum axe, floor pressure plate, dart trap shooter on wall, bubbling lava vent — all with clear danger appearance, dark dungeon palette with warm red danger highlights'],

  // ── Vehicles & Mounts ───────────────────────────────────────────────────────
  ['text', 'Pixel art rideable horse sprite sheet, 8-frame walk cycle side view, 32x32, transparent background, brown horse with saddle, reins and bridle, animated legs and flowing mane, classic top-down RPG horse mount'],
  ['text', 'Pixel art hot air balloon vehicle sprite, 6-frame gentle bobbing idle, 32x32, transparent background, colorful striped balloon envelope above, wicker basket below, small flame flickering inside, fantasy sky adventure aesthetic, bright primary color stripes on balloon'],
  ['text', 'Pixel art minecart vehicle sprite, 4-frame rolling on track animation, 32x32, transparent background, wooden minecart with metal wheels, rolling motion, rails visible below, speed lines for motion feel, dark cave environment colors, 2D platformer vehicle asset'],
  ['text', 'Pixel art rowboat sprite, 4-frame bobbing on water animation, 32x32, transparent background, wooden rowboat with two oars, water splashes around hull, oars dipping into water, calm lake atmosphere, warm brown wood and blue water colors'],

  // ── Isometric Assets ────────────────────────────────────────────────────────
  ['text', 'Isometric pixel art furniture tileset, 3 isometric items on transparent background, 64x64 each: a wooden table with 4 legs, a throne chair with ornate back, a bookshelf filled with colored books — warm brown wood palette, isometric perspective locked at standard 26.5 degree angle, game-ready edges'],
  ['text', 'Isometric pixel art tree collection, 4 trees in isometric view on transparent background: a large oak tree with full canopy, a bare winter tree, a pine tree snow-capped, a dead gnarled tree — all 64x64, dark green and brown palette, consistent isometric shadows, game-ready silhouette'],
  ['text', 'Isometric pixel art building blocks, 4 modular pieces on transparent background: 1-tile corner wall, 1-tile straight wall with window, 1-tile pillar, 1-tile roof section — 64x64 each, grey stone brick texture, isometric 26-degree angle, Dark Cathedral game set piece feel'],
  ['text', 'Top-down pixel art river and water tiles, 5 tiles on transparent background: calm water with subtle current direction arrows, shallow water with sandy bottom visible, waterfall edge with foam, river rapids white water, still pond with lily pads — blue-green flowing water palette, 16x16 grid, classic 2D RPG tileset compatible'],
  ['text', 'Top-down pixel art road and path tiles, 5 tiles on transparent background: dirt road straight, dirt road corner turn, paved stone road, paved road corner, path with grass growing through — earth and grey stone palette, 16x16, seamless edge tiling in all 4 directions, classic RPG Maker compatible'],

  // ── VFX, Particles & Effects ────────────────────────────────────────────────
  ['text', 'Pixel art game VFX sprite sheet, horizontal strip of 8 spell projectiles: fireball, ice shard, lightning bolt, earth rock, dark void orb, holy light beam, poison spittle, wind slash — each 16x16, transparent background, vibrant distinct colors per element, game-ready projectile loop'],
  ['text', 'Pixel art impact and hit effects sprite sheet, 6 separate 16x16 sprites on transparent background: yellow starburst impact, red slash hit mark, blue magic burst, white shield block shimmer, green poison splatter, white critical hit burst — all with 3-frame animation, crisp pixel art VFX'],
  ['text', 'Pixel art environmental particle effects sprite sheet, 4 looping effects on transparent background: falling autumn leaves (4 frames), heavy rain curtain (4 frames), snow falling gently (4 frames), dust blowing in desert wind (4 frames) — 16x16 each, subtle ambient feel, classic 2D game ambient layer'],

  // ── Card Game / Roguelike Assets ─────────────────────────────────────────────
  ['text', 'Pixel art card game card frame sprite sheet, 3 card frames in a row on transparent background: attack card frame (red border, sword icon), defense card frame (blue border, shield icon), magic card frame (purple border, star icon) — each 64x96 pixels, ornate pixel art border design, dark background showing frame only,TCG card frame template'],
  ['text', 'Pixel art card game symbol icons, 8 card symbols in a horizontal strip, 16x16 each on transparent background: heart (life), spade (death), diamond (treasure), club (nature), star (magic), skull (enemy), flame (fire), water (ice) — bold simple pixel art symbols, easily readable at card scale, single-color silhouette design'],
  ['text', 'Pixel art roguelike dungeon floor tile generator, 8 variations on transparent background: dungeon stone floor, cracked dungeon floor, floor with small rubble, floor with blood stain, floor with scattered bones, floor with candle melt puddle, floor with water drip, floor with scorch mark — dark grey stone palette, 16x16, atmospheric dungeon floor variations'],
  ['text', 'Pixel art roguelike room clear indicator and reward display, 3 separated pixel sprites on transparent background: cleared room star icon, hidden door reveal glow, boss room warning skull icon — 16x16 each, 4-frame sparkle animation on reveal glow, bold clear pixel art, dungeon crawler aesthetic'],
];

console.log(`准备入队 ${prompts.length} 条游戏开发者资产提示词...\n`);

const insert = db.prepare(`
  INSERT INTO gen_jobs
    (id, user_id, mode, model, size, quality, prompt, negative_prompt, reference_image_url, status, attempt_count, max_attempts, queued_at, created_at, updated_at)
  VALUES (?, NULL, ?, 'gpt-image-2', '1024x1024', 'medium', ?, '', NULL, 'queued', 0, 5, ?, ?, ?)
`);

const now = new Date().toISOString();
let added = 0;
let failed = 0;

for (const [mode, promptText] of prompts) {
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