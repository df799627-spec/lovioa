#!/usr/bin/env node
/**
 * Enqueue a massive batch of stunning fantasy scene prompts.
 * Focus: creative, ethereal, surreal, breathtaking fantasy aesthetics.
 * Covers: celestial, underwater, forest, ruins, sky islands, elemental realms, and more.
 * Run: node enqueue-fantasy-scenes.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const prompts = [
  // ── Celestial / Cosmic Fantasy ─────────────────────────────────────────────
  ['text', 'A vast celestial library built inside a massive crescent moon, infinite shelves of glowing books extending upward into the starfield, floating crystal reading lanterns drifting between rows, a scholar in silver robes looking up in awe, galaxies visible through translucent moon walls, ethereal silver and deep indigo atmosphere, breathtaking fantasy illustration, dramatic scale composition'],
  ['text', 'An ancient tree growing in the center of a spiral galaxy, roots diving into nebulae, branches made of crystallized starlight, glowing fruit that are actually miniature suns, a small figure standing on one of its roots looking at a planet below, cosmic fantasy environment, deep purple and gold color palette, epic scale concept art'],
  ['text', 'A crystal cathedral floating in the heart of a dying star, rose-quartz spires glowing with inner fire, stained glass windows showing constellations, a lone priest walking toward the altar as solar flares dance outside, warmth of dying sun contrast with cool cathedral stone, epic sci-fi fantasy landscape, dramatic lighting'],
  ['text', 'A library where knowledge manifests as constellations, the entire night sky is a bookshelf with stars arranged as letters forming words, a figure reading a book that lights up matching stars overhead, deep cosmic blue palette with golden star-light, magical cosmic fantasy atmosphere'],
  ['text', 'A giant celestial eye embedded in a mountain, the iris shifts color with emotions, the sky around it filled with clouds that mirror the eye color, a tiny village built into the cliff below the eye, cosmic deity fantasy scene, surreal scale contrast, deep teal and violet color scheme'],

  // ── Underwater / Abyssal Fantasy ───────────────────────────────────────────
  ['text', 'A grand underwater palace built by merfolk, coral pillars with bioluminescent jellyfish as chandeliers, schools of iridescent fish swimming through grand halls, stained glass windows showing underwater scenes, a mermaid queen on a throne of giant shells, saturated jewel-tone blues and greens, ethereal underwater light rays filtering from above, breathtaking fantasy illustration'],
  ['text', 'An ancient underwater city in a massive underwater trench, giant bioluminescent jellyfish the size of buildings floating through the ruins, kelp forests growing on collapsed rooftops, a deep-sea diver exploring with torch, shafts of surface light penetrating the abyss from far above, mysterious deep ocean fantasy atmosphere, dark teal with glowing cyan bioluminescence'],
  ['text', 'A giant underwater tree, its trunk a massive coral formation, roots spreading across the ocean floor, schools of tropical fish living in its canopy, an air pocket inside the trunk forming a natural grotto with treasure, vibrant underwater fantasy scene, saturated blue-green palette, warm golden light from above'],
  ['text', 'An underwater portal gateway, an ancient stone arch covered in barnacles and sea anemones, inside the arch is a swirling portal showing another realm with a golden city, two curious sea turtles approaching it, dreamy ethereal underwater atmosphere, contrast of dark ocean blue outside and golden light within the portal'],
  ['text', 'A cathedral of giant clams in the deep ocean, each clam shell the size of a house, open and showing glowing pearls inside, a figure in a diving suit marveling at them, shafts of light from above illuminating the clam garden, deep blue mysterious atmosphere with warm pearl glow, surreal underwater fantasy'],

  // ── Floating Sky Islands ───────────────────────────────────────────────────
  ['text', 'A cascade of floating islands in a sunset sky, waterfalls pouring off the edge of the top island into clouds below, a medieval castle on the top island with multiple lower islands connected by rope bridges, villages built into cliff sides, magical trees with glowing leaves, warm orange and gold sunset light illuminating the scene, epic fantasy landscape, breath-taking composition'],
  ['text', 'An enormous floating turtle carrying a small island on its shell, a village built on the island with pagodas and terraced farmland, small waterfalls cascading off the island edges, tiny figures living on this turtle world, dramatic storm clouds below, serene fantasy scene with warm golden light, Studio Ghibli meets epic fantasy scale'],
  ['text', 'A sky kingdom built on the back of a massive dormant air dragon, castle towers and banners on its back, a small town with windmills on its shoulders, people living on the dragon as if it is a living island, storm clouds and distant mountains far below, warm sunrise light from one side, fantastical living world concept art'],
  ['text', 'A cluster of floating islands at twilight, each island a different biome: tropical with palm trees, snowy with pine forest, desert with pyramids, all connected by sky ships and rope bridges, a sunset sky with stars beginning to appear, warm purple and orange twilight palette, magical steampunk-meets-fantasy sky archipelago'],
  ['text', 'A single ancient floating island in a sea of clouds, a massive weeping willow tree in the center with branches hanging down into the cloud sea below, its roots visible and wrapped around a crystal formation, a lone traveler standing at the edge looking down at the cloud ocean, serene ethereal atmosphere, silver-blue and soft green palette, dreamlike fantasy composition'],

  // ── Elemental / Primal Fantasy ──────────────────────────────────────────────
  ['text', 'The edge of a storm giant realm where the sky is literally made of swirling black and purple clouds with lightning forking constantly, massive stone towers built into the cloud floor, a figure with an umbrella standing at a balcony watching lightning below, epic stormy fantasy environment, dark purple and electric blue lightning contrast, dramatic and moody'],
  ['text', 'A realm of eternal autumn in the cosmos, a forest where leaves are individual galaxies, each leaf contains a swirling galaxy cluster, the ground is stardust, a figure walking through this cosmic autumn forest, two moons visible in a purple sky, surreal cosmic fantasy, gold and deep purple palette'],
  ['text', 'A volcanic landscape where rivers of liquid crystal flow instead of lava, crystal spires growing from the ground with rainbow refractions, a castle built from living obsidian glass, a figure observing this surreal crystal landscape, dramatic warm orange and cool blue contrast, surreal fantasy environment'],
  ['text', 'A realm where gravity is broken, a floating mountain with waterfalls flowing upward into the sky, trees growing in all directions on the cliff face, a small village built on the side where buildings hang from the rock, magical anti-gravity fantasy scene, ethereal soft blue and white palette, dreamlike surreal composition'],
  ['text', 'A frozen fantasy dimension of pure ice, a grand ice palace with every surface made of flawless crystal ice, rainbow light refracting through ice walls, giant frozen flowers made of ice crystals, a lone ice mage standing in the grand hall, breathtaking frozen fantasy, silver-blue and prismatic light, crystal clarity atmosphere'],

  // ── Ancient Ruins & Lost Civilizations ───────────────────────────────────
  ['text', 'A massive ancient library ruin in a jungle, stone shelves with remaining books overgrown by vines, the ceiling collapsed to reveal a stunning tropical forest canopy above, light shafts through the jungle canopy illuminating dust particles, a scholar exploring with a torch, ancient knowledge and nature reclaiming, fantasy ruins environment, warm green and golden light'],
  ['text', 'An ancient automaton guardian awakening in a forgotten underground facility, massive stone golem with glowing blue eyes in a cathedral-sized hall of dormant machines, the floor covered in dust, one eye just lighting up, the other still dark, ancient mechanical civilization, dark atmospheric fantasy, blue glowing eyes as the only light source'],
  ['text', 'A sunken temple complex half-submerged in a misty mountain lake, stone steps descending into the water, moss-covered pillars with carved faces, a small boat with a lantern approaching the temple at dusk, mountains reflected perfectly in the still water, ancient forgotten god temple, moody atmospheric fantasy, deep teal and misty grey palette'],
  ['text', 'An ancient dwarven city inside a massive hollow mountain, natural crystal formations providing light, intricate stone architecture carved into living rock, a river flowing through the main avenue, tiny figures of dwarves going about daily life, massive scale of the cavern interior, warm torch amber and cool crystal blue contrast, epic fantasy underground city'],
  ['text', 'Ruins of a civilization that existed on the back of a sleeping world-turtle, broken temples and towers half-buried in the creatures moss, ancient stone architecture showing their advanced knowledge of the turtle anatomy, a explorer mapping these strange ruins, surreal fantasy scale, warm brown earth tones and soft blue sky, unique world-building fantasy environment'],

  // ── Magical Forests & Enchanted Nature ─────────────────────────────────────
  ['text', 'An enchanted midnight forest where the trees are made of frozen starlight, their branches crystal and glowing softly, flowers on the ground emitting soft bioluminescence, a lone fox with glowing eyes walking through the forest, full moon visible through the crystal canopy, ethereal frozen starlight fantasy forest, deep blue night sky and silver-white glowing trees, magical atmosphere'],
  ['text', 'A tree so massive it forms its own ecosystem, the trunk wider than a castle, multiple waterfall streams flowing down its bark, entire villages built into its roots, forests growing on its upper branches, clouds forming around its canopy, a small figure looking up from the base in awe, epic scale fantasy tree world, vibrant green and brown earth tones, dramatic upward composition'],
  ['text', 'A forest where the trees have faces carved by time and magic, their expressions range from wise to mischievous, glowing spirit fireflies living in the hollows where eyes would be, moss and flowers growing on their shoulders like garments, a traveler walking between these living guardian trees, mythical forest spirit environment, warm amber firefly glow against cool green and brown bark, storytelling fantasy atmosphere'],
  ['text', 'A crystal flower garden in a fantasy dimension, every flower is a different colored crystal with light refracting from each petal, walking through it creates music as your footsteps resonate with the crystals, a lone figure in a flowing dress walking through the crystal garden at golden hour, prismatic light and rainbow reflections everywhere, breathtaking fantasy flower realm, warm and cool color contrast'],
  ['text', 'A fungal fantasy forest, giant bioluminescent mushrooms the size of trees, some glowing purple, some yellow, some blue, spore particles floating in the air like snow, a small creature with a lantern walking along a mushroom cap, fairy tale fantasy forest, dark atmospheric background with vibrant glowing mushroom colors, magical surreal mood'],

  // ── Ethereal / Dreamlike Fantasy ───────────────────────────────────────────
  ['text', 'A dream dimension where the sky is made of flowing liquid silver, buildings rise from the silver sky like waves, a figure walks on the surface of the liquid sky, reflections of other worlds visible in the silver surface, surreal dreamlike fantasy, cool silver-blue and deep purple palette, ethereal flowing composition'],
  ['text', 'A library made of solidified light beams, laser-like light pillars forming the walls and shelves, books made of pure light floating in the air, a figure reading a light-book with their hands glowing, the entire room is the inside of a light prism, surreal fantasy library, prismatic rainbow refractions everywhere, ethereal bright fantasy scene'],
  ['text', 'A garden where gravity does not exist and plants grow in all directions: upside down trees, flowers floating in mid-air, a river flowing upward into the sky, a figure floating gently, surreal dreamlike garden, soft pastel colors of pink blue and yellow, serene ethereal atmosphere, surreal fantasy dream world'],
  ['text', 'A vast field of white flowers under an aurora sky, each flower turns to follow the viewer as they walk through the field, the aurora reflects in the petals making them shimmer with all colors, a small figure lying in the flowers looking up at the aurora, serene fantasy landscape, white and silver flower field contrasting with vibrant green and purple aurora, breathtaking peaceful atmosphere'],
  ['text', 'A surreal landscape where the horizon shows the edge of a cliff that goes into infinity, waterfalls falling off that edge into absolute white void, a medieval castle at that edge with people living ordinary lives unaware, surreal fantasy composition, dramatic stark white void below, deep blue and orange dramatic sky, surreal perspective'],

  // ── Nightmarish / Dark Fantasy Landscapes ─────────────────────────────────
  ['text', 'A dark fantasy landscape of floating stone islands in a void of deep red, each island covered in twisted dead trees, rivers of dark water flowing off the edges into the void, a giant skeletal creature perched on one island watching, dark moody atmosphere, deep red and black color palette, haunting fantasy environment'],
  ['text', 'A dead world forest where every tree is a fossil, turned to stone mid-growth, their branches crystalized, a single living creature walking through this petrified forest looking back, dramatic red sky setting, stone forest with crystal branches, dark fantasy post-apocalyptic landscape, warm red and cold grey stone contrast'],
  ['text', 'A dark fantasy city built in the roots of a colossal dead god, tiny buildings and temples built into the massive spine and ribcage of the creature, tiny inhabitants going about life, the scale of the god body is staggering, dark fantasy world-building, muted grey and brown with warm torch light, epic dark fantasy composition'],

  // ── Celestial Mountains & Peaks ────────────────────────────────────────────
  ['text', 'A mountain range where each peak is a different element solidified: a water mountain with frozen waterfalls mid-fall, a fire mountain with dormant lava rivers, a wind mountain with clouds literally flowing down its sides, a stone mountain with ancient carved faces, a traveler on a path between these elemental peaks, epic elemental mountain fantasy landscape, vibrant contrasting element colors'],
  ['text', 'A mountain that reaches above the clouds into pure starlight, the base of the mountain is tropical jungle, the middle has snow and pine trees, the peak enters a starfield, three biomes in one mountain, a path winding up the entire mountain with a small figure near the top, epic scale fantasy mountain world, lush greens to pure whites to starry black, dramatic vertical composition'],
  ['text', 'A city built on the very tip of an impossibly tall spire mountain, buildings stacked vertically along the narrow tip, rope bridges connecting to smaller spires, a massive telescope on the summit pointing at stars, dramatic aerial perspective looking down, fantasy city on mountain peak, warm golden lights of the city against deep blue twilight sky, epic fantasy vertical city'],

  // ── Seasonal / Temporal Fantasy ──────────────────────────────────────────
  ['text', 'A fantasy landscape showing four seasons in one scene: one side of a hill has cherry blossoms in full spring bloom, another side has summer lush green forest, a slope has autumn orange and red foliage, the top has winter snow, a traveler standing at the center seeing all seasons at once, magical season fusion fantasy, vibrant contrasting seasonal palettes, surreal beautiful composition'],
  ['text', 'A twilight realm where day and night exist simultaneously as two halves of the sky, golden warm sunrise on one half, deep blue starry night on the other, a castle exactly on the border where both lights meet, people walking in the eternal twilight center, surreal fantasy landscape, dramatic warm-cold color split, ethereal meeting-of-worlds atmosphere'],

  // ── Architecture Fantasy ───────────────────────────────────────────────────
  ['text', 'A spiral tower that twists into the sky for no structural reason, an architect playing god with physics, ornate architecture that defies gravity, a figure walking up the outer spiral path with clouds below, surreal architecture fantasy, warm cream and pale gold stone, striking spiral composition, beautiful impossible geometry'],
  ['text', 'A library city built into the side of a waterfall cliff, buildings built behind the waterfall so the falling water creates the backdrop of every room, bridges connecting buildings through the waterfall, a scholar walking across a bridge while the waterfall roars beside them, magical architecture fantasy, cool blue water contrast with warm golden interior lights, unique fantasy atmosphere'],
  ['text', 'A palace built inside a massive geode crystal formation, the entire interior is lined with purple and pink amethyst crystals, natural crystal spires as columns, a throne carved from one large crystal formation, dramatic purple light refractions everywhere, surreal crystal palace fantasy, prismatic violet and magenta palette, breathtaking crystalline interior'],

  // ── Creatures in Landscapes ────────────────────────────────────────────────
  ['text', 'A titan giant sleeping in a valley, his body is part of the landscape — grass growing on his belly, small villages built on his shoulder, rivers flowing down his arm, wildflowers in his hair, a tiny figure climbing one of his fingers to reach his hand, landscape-scale fantasy creature, lush green and warm brown palette, gentle epic atmosphere'],
  ['text', 'A sea monster the size of a mountain swimming through a night sky filled with stars and nebulae, barnacles and small settlements on its back, its eye the size of a lake glowing with bioluminescence, clouds forming around it as it moves, cosmic fantasy sea creature, deep purple sky and warm golden eye glow contrast, breathtaking epic scale'],
  ['text', 'A flock of giant birds carrying a entire floating village on their backs, the village built on a platform suspended between them, people living in tree-houses woven into the birds feathers, the birds flying over an endless ocean at sunrise, fantasy living sky-ship, warm golden sunrise light on the birds and village, serene epic fantasy scene'],

  // ── Surreal / Abstract Fantasy ─────────────────────────────────────────────
  ['text', 'A fantasy landscape where the laws of physics are played with visually: a river that flows in a perfect circle and returns to itself, a house where the roof is the floor and the ceiling is the ground, a tree that grows downward with roots reaching into a starry sky, a mountain with its reflection showing a different landscape entirely, surreal fantasy puzzle world, hyper-detailed surrealism, warm and cool color palette'],
  ['text', 'An abstract fantasy dimension of pure geometry, massive geometric shapes (cubes, spheres, pyramids) in impossible arrangements, floating in a void of deep cosmic purple, a tiny geometric figure exploring this abstract realm, surreal mathematical fantasy landscape, bold primary colors against deep cosmic purple background, striking geometric art composition'],
  ['text', 'A landscape where music is visible, sound waves shown as physical rippling patterns in the air, colors corresponding to different notes, a musician playing an instrument with visible music notes floating as colorful particles, synesthetic fantasy scene, vibrant musical color palette, beautiful surreal artistic concept'],

  // ── Ethereal Portals & Gates ───────────────────────────────────────────────
  ['text', 'A massive ancient gateway between two worlds, carved stone archway covered in glowing runes, one side shows a green spring forest, the other side shows a frozen winter tundra, a figure standing exactly at the threshold half in each season, dramatic gateway fantasy scene, vibrant spring colors on one half and cool winter blues on the other, striking visual division'],
  ['text', 'A portal gate in the center of a vast desert, the gate is made of twin monolith stones with a swirling dimensional rift between them, desert nomads approaching cautiously with camels, the sky above the portal showing a glimpse of a different world (city, mountain, ocean), mysterious desert portal, warm sandy brown desert contrasting with cool blue magical portal glow, adventurous fantasy atmosphere'],
  ['text', 'A staircase going down into a lake, a spiral staircase descending into the water, each level showing a different underwater world through the transparent steps, fish swimming around each landing, a figure descending these magical underwater stairs, surreal fantasy underwater architecture, cool blue-green water palette with warm torch light, mysterious depth composition'],
];

console.log(`准备入队 ${prompts.length} 条幻想场景提示词...\n`);

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
    const tag = promptText.match(/^[^,]+/)[0].trim();
    console.log(`  + ${tag.slice(0, 55)}`);
  } catch (e) {
    failed++;
    console.log(`  x 失败: ${e.message}`);
  }
}

console.log(`\n成功入队: ${added} 条  |  失败: ${failed} 条`);

const queue = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs GROUP BY status ORDER BY status").all();
console.log('\n=== 当前队列状态 ===');
queue.forEach(r => console.log(`  ${r.status}: ${r.c}`));

db.close();