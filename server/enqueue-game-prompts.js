#!/usr/bin/env node
/**
 * Enqueue game asset prompt jobs into gen_jobs.
 * Run: node enqueue-game-prompts.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const gamePrompts = [
  // RPG Characters
  ['text', 'RPG character concept art, a elderly elven mage with long silver hair and glowing blue eyes, wearing flowing indigo robes embroidered with constellations, staff in hand, dramatic magical aura, fantasy game art style, intricate details'],
  ['text', 'RPG character portrait, a battle-scarred orc warrior with tusks and war paint, heavy plate armor covered in clan markings, two-handed greataxe on back, intense stoic expression, dark fantasy art style'],
  ['text', 'RPG character design, a young female knight in radiant silver armor with a heraldic crest on her shield, holding a holy sword that glows with golden light, cathedral background, From Software inspired'],
  ['text', 'RPG character sheet, a masked ninja assassin in all-black stealth gear with twin katanas, crouched in attack stance, cherry blossom petals in the wind, Japanese game art style, three-view pose'],
  ['text', 'RPG character art, a charismatic bard with golden curls, colorful patchwork coat covered in pockets and hidden instruments, grin on face, lute in hand, tavern background, D&D inspired'],

  // Game Environments
  ['text', 'Isometric RPG game environment art, a cozy forest village at dawn, thatched-roof cottages with smoking chimneys, a stone well in the village square, flowers and herbs growing everywhere, morning fog, warm golden light'],
  ['text', 'Open world RPG landscape, a vast mountain valley with ancient ruins half-buried in snow, a winding path leading to a fortress on the cliff edge, stormy dramatic sky, massive scale environment, cinematic'],
  ['text', 'RPG dungeon environment art, an underground crystal cavern with glowing blue and purple crystals embedded in cave walls, a hidden treasure chest on a stone platform, bioluminescent fog, ethereal lighting'],
  ['text', '2D game background, a sunset over a medieval walled city viewed from the sea, tall stone towers with flags, fishing boats in the harbor, seagulls, painterly art style, warm orange and purple sky'],
  ['text', 'Metroidvania game environment, an ancient overgrown temple ruins with massive stone columns covered in vines, shafts of golden sunlight piercing through the canopy, mysterious atmosphere, rich detail level'],

  // Item & Props
  ['text', 'Video game item art, a legendary sword lying on a stone altar in a dark cave, blade made of frozen blue ice with silver runes, a glowing aura of cold mist emanating from it, Diablo style item icon'],
  ['text', 'Game prop design, a fantasy medicine potion bottle made of dark green glass with a cork stopper, liquid glowing yellow inside, herb leaves and bandages wrapped around it, pixel art style with rich detail'],
  ['text', 'RPG weapon design, a pair of ornate daggers with golden cross-guards in the shape of eagle wings, handles wrapped in black leather, blades with damascus steel pattern, displayed crossed, dark fantasy aesthetic'],
  ['text', 'Game crafting material icons, an arrangement of rare ingredients for alchemy — glowing mushrooms, dragon scales, glowing crystals, dried herbs, in a dark leather pouch, isometric flat lay style'],
  ['text', 'Video game armor set, a complete set of hunter gear from a fantasy game, hooded cloak in forest green, leather armor with belt pouches, quiver of arrows, longbow, displayed on a wooden mannequin, witcher-inspired'],

  // Enemies & Monsters
  ['text', 'Boss monster concept art, a massive ancient dragon coiled around a volcano crater, scales cracked and glowing with lava veins, wings spread wide against a dark ash-filled sky, epic scale comparison with tiny human figure'],
  ['text', 'Game enemy character art, a grotesque undead skeleton knight with a shattered helmet, wielding a jagged broken sword as a spectral weapon, glowing red eyes in dark sockets, dark fantasy, detailed bone structure'],
  ['text', 'Tower defense game enemy, waves of goblin warriors with crude iron weapons and hide shields, war drums in the background, charging forward with war cries, stylized cartoon game art, multiple units'],
  ['text', 'Eldritch horror game boss, an amorphous cosmic horror with tentacle appendages and multiple glowing eyes, entity partially emerging from a dimensional rift, dark purple and black void, cosmic horror art style'],
  ['text', 'Game enemy spawn, a hive of giant insect enemies emerging from underground tunnels, part-buried massive cocoons, adult insect creatures with iridescent shells, alien biome, Alien Isolation meets Metroid environment'],

  // UI & HUD
  ['text', 'Video game UI design, a fantasy RPG inventory screen with worn leather texture border, grid of item slots, equipped items shown on character silhouette, parchment background, gothic game UI style, detailed icons'],
  ['text', 'Mobile game UI, a vibrant colorful quest tracker panel with rounded corners and gradient fill, circular avatar portrait, XP progress bar, level badge, sparkle effects, modern casual game aesthetic, flat design'],
  ['text', 'Game world map UI, an ancient pirate treasure map spread on a wooden table, hand-drawn coastlines with sea monsters in the margins, X marks the spot, compass rose, burnt parchment texture, aged aesthetic'],
  ['text', 'Game skill tree UI, a fantasy constellation-style skill tree with glowing nodes connected by energy lines, unlocked skills in gold, locked skills in dark gray, central root node, dark mystical background'],

  // Game Worlds & Sci-Fi
  ['text', 'Cyberpunk game scene, a rain-soaked neon-lit alleyway in a futuristic megacity, holographic advertisements flickering on wet walls, steam rising from grates, a lone figure in a trench coat walking away, Blade Runner atmosphere'],
  ['text', 'Space exploration game environment, a massive derelict alien spacecraft discovered in deep space, hull breached and interior visible, emergency lights flickering, distant stars and nebula visible through windows, massive scale'],
  ['text', 'Steampunk game asset, a mechanical airship with exposed brass gears and copper pipes, sailcloth wings, crew visible on deck, flying above a Victorian industrial city with factory smokestacks, warm sunset sky'],
  ['text', 'Fantasy game world map, an entire continent on an ancient map with illustrated borders, different terrain types hand-drawn in different styles — mountains, forests, swamps, coastal towns, parchment aged paper texture'],
  ['text', 'Turn-based strategy game scene, a tactical battle map showing two armies facing each other across a river, hex grid visible, medieval fantasy units arranged in formation, dramatic sky with storm clouds approaching, overhead isometric view'],
];

console.log(`准备入队 ${gamePrompts.length} 条游戏提示词...\n`);

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
    console.log(`  + ${promptText.slice(0, 60)}...`);
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