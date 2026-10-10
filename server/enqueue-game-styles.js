#!/usr/bin/env node
/**
 * Enqueue game asset prompts across MANY distinct art styles.
 * Goal: attract every type of game developer by covering every major visual style.
 * Run: node enqueue-game-styles.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const prompts = [
  // ── 1. Pixel Art (classic 8/16-bit, but slicable) ──────────────────────────
  ['text', 'Pixel art sprite sheet, a ninja character 8-frame walk cycle, side view, 16x16 pixels, transparent background, black and grey color scheme, headband trailing, holding twin daggers, classic NES ninja game feel, clean flat colors with dark outlines'],
  ['text', 'Pixel art tileset for a retro RPG town, 16x16 pixel grid on transparent background: cobblestone main road, grass tile 4 variants, dirt path, wooden bridge over stream, stone well, market stall awning, wooden signpost, fence segment — warm earth color palette, NES Final Fantasy town tile feel'],
  ['text', 'Pixel art enemy sprite sheet, a goomba-style enemy walking 4-frame cycle, 16x16, side view, transparent background, round brown mushroom creature with angry white eyes, stubby feet, comical but threatening, classic 8-bit platformer enemy'],

  // ── 2. Hand-Painted (World of Warcraft / Lost Ark style) ───────────────────
  ['text', 'Hand-painted game character concept art, a warrior woman in ornate golden plate armor, flowing crimson cloak, standing heroically with sword raised, dramatic wind-swept hair, painted texture visible on armor plates, warm golden hour lighting, World of Warcraft character art style, rich painterly detail'],
  ['text', 'Hand-painted game environment art, a mystical floating island in the sky at golden sunset, ancient stone ruins with moss and flowers growing on crumbling walls, a single gnarled tree at center, soft volumetric clouds below, painterly brush strokes visible, fantasy MMORPG zone art, warm orange and teal sky contrast'],
  ['text', 'Hand-painted game item icon, a legendary greatsword resting on a stone altar, blade made of swirling dark iron with crimson energy veins, ornate gold crossguard shaped like dragon wings, handle wrapped in red dragon scale leather, painterly painted texture, glowing dark aura, RPG item icon art style'],
  ['text', 'Hand-painted game character art, a forest dryad with skin made of bark and moss, leaves growing from hair like a crown, glowing amber eyes, wild organic body proportions, standing in a sunlit forest clearing, painted texture with visible brush strokes, nature goddess aesthetic, fantasy RPG character art'],

  // ── 3. Low-Poly (geometric stylized 3D) ─────────────────────────────────────
  ['text', 'Low-poly game character art, a knight in geometric faceted armor, bright colored polygon faces with flat shading, triangular pauldrons, kite shield with simple emblem, held sword in classic hero pose, standing on stone platform, solid bright color palette of silver and blue, no texture detail visible, geometric abstract warrior style'],
  ['text', 'Low-poly game environment art, a geometric forest scene with low-poly trees, faceted triangular pine trees in rows, faceted ground planes, a low-poly wooden cabin with only 8 visible polygon faces, faceted sky sphere with gradient, clean geometric style, bold single-color foliage (dark green, brown, grey), flat-shaded no texture'],
  ['text', 'Low-poly game vehicle art, a stylized low-poly hot air balloon, geometric faceted balloon envelope in warm stripes, faceted wicker basket, simple geometric burner flame, bright saturated polygon colors (red yellow orange), visible flat-shaded triangles, no smooth surfaces visible anywhere, clean low-poly aesthetic'],
  ['text', 'Low-poly game weapon and item props, multiple low-poly weapons displayed crossed on transparent background: a faceted iron sword, a gem-encrusted axe, a wooden bow, a crystalline staff — each made of clearly visible flat-shaded polygons, no curves, bold single-color materials, isometric presentation'],

  // ── 4. Anime / Manga Style ──────────────────────────────────────────────────
  ['text', 'Anime game character art, a silver-haired swordmaster in a dynamic attack pose mid-leap, sharp confident expression, flowing white and blue hakama, drawn katana with blue energy edge, speed lines and impact sparks around blade, dramatic anime fight scene composition, Studio Bones-style clean anime linework with cel shading'],
  ['text', 'Anime game environment art, a rainy cyberpunk city street at night, neon reflections on wet asphalt, holographic kanji signs in pink and blue, a lone figure with umbrella walking into fog, dramatic anime cinematic composition, cel-shaded with ink outlines, atmospheric anime mood lighting'],
  ['text', 'Anime game chibi character sheet, 3 chibi hero characters in a row on transparent background: a cheerful red-haired mage girl with staff, a cool blue-haired swordsman boy with cape, a small green-cloaked archer girl with bow — big heads big eyes chibi proportions, clean anime art style, bold outlines, pastel color palette, cute anime game style'],
  ['text', 'Anime game enemy boss character art, a colossal armored demon king seated on a throne of skulls, glowing red eyes, tattered black cloak, massive halberd, cracks of dark energy emanating from armor, dramatic anime boss reveal composition, cel-shaded with heavy ink outlines, dark purple and crimson color scheme'],
  ['text', 'Anime game UI design, a clean anime-style skill card interface, 3 skill cards displayed: attack skill with red flame border, defense skill with blue ice border, magic skill with purple arcane border — each card with anime character portrait, clean cel-shaded illustration style, crisp ink outlines, dark UI panel with ornate gold frame, anime RPG aesthetic'],

  // ── 5. Corporate Memphis / Flat Vector ───────────────────────────────────────
  ['text', 'Corporate Memphis game character art, a diverse group of 3 stylized game characters in a row: a tall character with exaggerated long limbs in purple hoodie, a round character with small head in yellow jacket, a character with one very large hand in blue outfit — all in flat solid color shapes, no outlines, exaggerated proportions, abstract wavy hair, modern flat vector game art style'],
  ['text', 'Corporate Memphis game scene illustration, a flat vector game loading screen scene: a giant hand holding a tiny game controller, flat geometric character figures dancing around it, abstract blob shapes in background, solid bright colors without gradients, no outlines, playful corporate Memphis game aesthetic, teal pink yellow orange palette'],
  ['text', 'Corporate Memphis game UI icons, a row of 8 flat vector game icons on transparent background: joystick, game cartridge, headphones, gaming chair, pixel heart health, star badge, lightning bolt power, diamond trophy — all in solid flat colors, exaggerated rounded shapes, no outlines, modern casual game flat vector style'],

  // ── 6. Dark / Gritty Realistic ───────────────────────────────────────────────
  ['text', 'Dark gritty game character concept art, a battle-worn female mercenary in practical leather armor covered in scratches and dried blood, exhausted expression, bandaged arm, realistic human proportions with no fantasy exaggeration, standing in rain-soaked alleyway, photorealistic texture on leather, dark cool color palette, The Last of Us meets Dark Souls atmosphere'],
  ['text', 'Dark realistic game environment art, an abandoned military base overgrown with vegetation, rusted Humvee half-buried in mud, concrete walls with bullet holes and graffiti, overcast heavy grey sky, realistic vegetation growth on man-made structures, photorealistic material study, silent post-apocalyptic atmosphere, no fantasy elements'],
  ['text', 'Dark gritty game weapon design, a heavily customized revolver with scratched metal, wrapped handle with fraying paracord, mounted tactical flashlight, extended barrel with threaded suppressor, realistic gun metal grey and black, hyper-detailed surface wear and scratches, close-up product render, modern tactical shooter weapon aesthetic'],

  // ── 7. Watercolor / Storybook ────────────────────────────────────────────────
  ['text', 'Watercolor storybook game character art, a kind elderly wizard character, soft loose watercolor brush strokes visible, warm sepia and indigo washes, gentle expression, simple clothing with visible wet-on-wet watercolor bleed, floating magical particles rendered as watercolor splashes, storybook fairy tale illustration style, delicate transparent washes'],
  ['text', 'Watercolor game environment art, a peaceful enchanted forest rendered in soft watercolor, loose flowing brush strokes, gentle green and gold washes for sunlit canopy, misty background with wet-on-wet bleeding, tiny watercolor splatter details for texture, storybook illustration feel, Hans Andersen fairy tale atmosphere'],
  ['text', 'Watercolor game item design, a magical artifact collection rendered in soft watercolor technique: a glowing amber potion, a leather-bound spellbook with watercolor bleed pages, a crystal pendant with light refractions as watercolor blooms — all with visible brush stroke texture, warm sepia tones, storybook illustration aesthetic'],

  // ── 8. Minimalist / Clean ────────────────────────────────────────────────────
  ['text', 'Minimalist flat design game character art, a character designed with only 3 flat color shapes: a circle head in solid color, a rectangular body in solid color, small arm and leg rectangles, no outlines no detail no shading, solid primary colors, ultra-clean minimalist game character, design-study flat silhouette style'],
  ['text', 'Minimalist game environment art, a landscape composed of only 4 flat color bands: deep blue sky at top, light blue mountains middle band, green rolling hills second band, dark foreground — each band a solid flat color with no detail, ultra minimalist flat design landscape, bold color field composition, modernist art poster aesthetic'],
  ['text', 'Minimalist game UI icons, 8 icons composed of only simple geometric shapes on white background: a circle for health, a rounded square for inventory, a triangle for danger, a diamond for rare, simple line icons in consistent thin stroke style, all using only 2 colors, ultra-clean minimalist game icon design, Apple HIG meets Monument Valley aesthetic'],

  // ── 9. Retro / Vintage (60s-70s psychedelic / vintage poster) ────────────────
  ['text', 'Retro vintage psychedelic game poster art style, a fantasy adventuring party walking toward a glowing mountain, 1970s vintage poster illustration style, warm analog color palette of burnt orange and teal, visible halftone dot print texture, vintage typography block letters in background, psychedelic swirling landscape in distance, old adventure travel poster aesthetic, vintage analog color grading'],
  ['text', 'Retro 1960s space age game art, a rocket ship and astronaut character in vintage Space Age illustration style, warm orange and cream palette, visible mid-century modern geometric shapes, retrofuturistic chrome bubble helmet, simple bold shapes, vintage comic book halftone dots, optimistic Space Race era aesthetic'],
  ['text', 'Retro 1980s arcade game art, a character in pure 80s arcade neon pixel art style with CRT scanline overlay: bright neon pink and cyan on black background, glowing edges on character, simple bold 16-bit sprite design with modernized color depth, retro arcade cabinet art aesthetic, scanline and CRT glow effect baked in'],

  // ── 10. Sketch / Concept Art ─────────────────────────────────────────────────
  ['text', 'Concept art sketch style game environment, a medieval fantasy tavern drawn in loose pencil sketch technique, visible graphite pencil strokes, cross-hatching for shadows, construction lines still visible, annotation arrows pointing to key design elements, rough gestural sketch quality, full of confident artistic energy, concept art development sketchbook page feel'],
  ['text', 'Concept art sketch style game character, a armored warrior drawn in rough gestural pencil sketch, confident quick strokes, construction anatomy skeleton visible underneath, scribbled armor plating notes in margins, annotation text like "more volume on pauldrons" and "fix left wrist", rough black pencil on warm grey paper, concept art development sheet'],

  // ── 11. Art Deco / Geometric ─────────────────────────────────────────────────
  ['text', 'Art Deco game character art, a noble character in 1920s Art Deco style, geometric angular body proportions, sharp stepped shoulder pauldrons, zigzag geometric patterns on clothing, sunburst radiating behind head as halo, warm gold and black color scheme, Egyptian-French Art Deco ornamental style, bold clean geometric shapes'],
  ['text', 'Art Deco game environment art, a grand Art Deco casino palace exterior, geometric stepped ziggurat architecture, sunburst decorative motifs, hexagonal and chevron patterns, warm gold and deep green facade, Art Deco fountain in foreground, symmetrical grand composition, 1920s Gatsby-style Art Deco architectural illustration'],
  ['text', 'Art Deco game UI design, Art Deco styled HUD elements: an ornate geometric frame border using stepped zigzag shapes, geometric diamond and sunburst decorative elements, Art Deco style letterforms for "PLAY" button, gold and deep navy color scheme, symmetrical ornamental UI panel design, bold Art Deco graphic style'],

  // ── 12. Isometric Clean (Apple / Monument Valley style) ─────────────────────
  ['text', 'Clean isometric game scene in Monument Valley style, a serene architectural scene: a floating white stone building with pink gradient roof, an isometric粉色 staircase leading up, a small pink tree casting shadow, soft pastel color palette of pink blue and cream, clean solid shapes with no outlines, Monument Valley pastel isometric aesthetic'],
  ['text', 'Clean isometric game character, a small clean isometric hero figure in Monument Valley style, simple geometric body made of 4-5 solid isometric shapes, warm terracotta red color, standing on isometric white stone platform, tiny shadow below, ultra-clean pastel isometric design, Monument Valley and Gorogoa art style'],
  ['text', 'Clean isometric game UI scene, an isometric game shop scene: a small white stone booth with a flat counter, 4 isometric item pedestals with glowing objects on top, a small character figure shopping, soft pastel color palette, clean Monument Valley isometric aesthetic, no outlines, solid pastel shapes only'],

  // ── 13. Japanese Woodblock / Ukiyo-e ───────────────────────────────────────
  ['text', 'Ukiyo-e woodblock print style game character art, a samurai warrior in traditional Japanese woodblock print style, bold outlines, flat areas of indigo and vermillion, traditional ukiyo-e composition with dramatic diagonal composition, cherry blossom petals in wind, mountain in mist background, classic Hiroshige color palette, Japanese Edo period woodblock aesthetic'],
  ['text', 'Ukiyo-e style game environment art, a dramatic mountain landscape with a warrior on a cliff overlooking a valley village, traditional Japanese woodblock print style, visible woodblock line work, flat bold color areas, dramatic perspective from above, misty blue mountains fading into distance, ukiyo-e travel poster aesthetic, indigo and gold ochre color scheme'],
  ['text', 'Ukiyo-e style game monster art, a fearsome dragon rendered in traditional Japanese woodblock print style, bold black outlines, flat areas of indigo, vermillion and gold, dramatic swirling composition, stylized wave and cloud patterns as background, bold graphic Japanese monster art, Edo period woodblock ink aesthetic'],

  // ── 14. Steampunk / Industrial ──────────────────────────────────────────────
  ['text', 'Steampunk game character art, a Victorian engineer adventurer in full brass steampunk gear: brass and copper articulated armor plates, tall top hat with steampunk goggles on band, mechanical arm with visible gears and pistons, brass chronometer pocket watch, leather apron with tools, steam venting from joints, warm copper and brown color palette, detailed mechanical steampunk aesthetic'],
  ['text', 'Steampunk game environment art, a Victorian underground laboratory, brass pipes running along stone walls, large steampunk machinery with visible gears and pressure gauges, a大型 brass airship engine on workbench, warm gas lamp lighting casting amber glow, steam haze in air, copper and iron color palette, Industrial Age Victorian steampunk atmosphere'],
  ['text', 'Steampunk game props and gadgets, 6 steampunk items on display: a brass compass with gear workings exposed, a steam-powered pistol with visible boiler, brass and leather aviator goggles, a key with ornate gear-tooth teeth, a mechanical pocket watch with exposed movement, a copper water canteen with pressure valve — all on dark leather background, warm brass and iron palette, detailed steampunk gadget aesthetic'],

  // ── 15. Cartoony / Cartoon Network Style ─────────────────────────────────────
  ['text', 'Cartoon Network style game character art, a heroic young adventurer in loose cartoon style, exaggerated rubber-hose limbs, big expressive eyes, wildly exaggerated facial expressions, thick black outlines, bold flat colors with no shading, dynamic cartoon action pose, bouncing cartoon energy, Adventure Time / Cartoon Network cartoon character style'],
  ['text', 'Cartoon style game enemy art, a goofy cartoon monster enemy, exaggerated wobbly body, big googly mismatched eyes, silly tongue sticking out, wild cartoon proportions, thick black outlines everywhere, bold flat colors, completely cartoony design, funny cartoon monster design — funny rather than scary'],
  ['text', 'Cartoon style game environment art, a cartoon jungle environment, exaggerated wobbly cartoon trees with big round leaves, chunky cartoon rocks with big cartoon eyes peeking out, a bouncy cartoon rope bridge, thick black outlines on everything, bold bright green and brown palette, Adventure Time style jungle aesthetic'],
  ['text', 'Cartoon Network style game UI elements, 6 cartoon UI buttons and frames on transparent background: a big round cartoon "GO" button, a star-shaped reward button, a cartoon speech bubble UI panel, a cartoon treasure chest icon button, a cartoon heart health bar, a cartoon arrow navigation button — all with thick black outlines and bold flat colors, cartoon game UI style'],

  // ── 16. Horror / Cosmic Dread ─────────────────────────────────────────────────
  ['text', 'Cosmic horror game character art, an explorer who has encountered cosmic dread, face partially transformed with subtle otherworldly mutations, unsettling elongated proportions, deep cosmic void colors of black and deep purple, tentacles subtly growing from shadow, hyperrealistic but deeply wrong, Lovecraftian cosmic horror atmosphere, muted cold palette'],
  ['text', 'Cosmic horror game environment art, a non-Euclidean alien structure in a void, architecture that defies geometry, walls shifting at edges of perception, deep black and bioluminescent purple, organic growths on stone surfaces, impossible perspective, cosmic void surrounding the structure, deeply unsettling atmospheric horror, muted dark palette with subtle bioluminescence'],
  ['text', 'Horror game asset art, a row of horror item pickups on transparent background: a cursed doll with visible stitching, a dark grimoire with shifting symbols, a beating heart in a jar, an antique key with dried blood, a mirror showing a face that is not yours — each 32x32, ultra-dark horror palette, photorealistic texture horror game aesthetic'],

  // ── 17. Cyberpunk / Synthwave ───────────────────────────────────────────────
  ['text', 'Cyberpunk game character art, a female netrunner in futuristic street gear, holographic cybernetic arm visible, neon-lit jacket reflecting pink and cyan city lights, cropped hair with embedded LED strips, augmented eye glowing, rain on chrome jacket surface, cyberpunk rain-soaked neon street atmosphere, dark blue and hot pink color palette'],
  ['text', 'Cyberpunk game environment art, a night market in a neon-lit cyberpunk megacity alley, holographic vendor stalls with glowing kanji signs, steam from food carts, crowds in cyberpunk outfits, rain puddles reflecting neon signs in pink cyan and yellow, cyberpunk street market atmosphere, Blade Runner 2049 inspired, high contrast neon on dark background'],
  ['text', 'Synthwave game UI design, retro-futuristic 80s synthwave game interface: neon gradient border frames in pink-cyan, retro wingdings-style icon buttons, gradient-filled progress bars in hot pink to purple, CRT scanline overlay, flat color geometric buttons, bold synthwave color palette, outrun synthwave game aesthetic'],

  // ── 18. Medieval / Illuminated Manuscript ──────────────────────────────────
  ['text', 'Illuminated manuscript style game art, a medieval hero character in the style of an illuminated manuscript, rich gold leaf backgrounds, bold outlines, flat vibrant colors with gold decorative borders, Celtic knotwork patterns on clothing, manuscript-style halos, medieval heraldic composition, rich jewel tone palette of red blue and gold, illuminated manuscript RPG character art'],
  ['text', 'Illuminated manuscript style game environment, a medieval town scene in illuminated manuscript style, rich flat gold background, bold flat color buildings, decorative manuscript borders with flowers and vines, miniature knights and merchants in foreground, illuminated manuscript page aesthetic, rich jewel tones, medieval illuminated manuscript page layout'],

  // ── 19. Street Art / Graffiti ────────────────────────────────────────────────
  ['text', 'Graffiti street art style game character art, a hip-hop street warrior character rendered as a graffiti mural, bold spray paint strokes, dripping paint effects, layered vibrant colors with visible spray can texture, 3D throw-up bubble letters in background spelling game title, vivid street art aesthetic with spray paint drips and splatters'],
  ['text', 'Graffiti style game environment art, a neighborhood street scene rendered as a street art mural, bold spray paint colors, visible spray can drip effects, brick wall background with graffiti tags, bright street art characters, 3D block letter graffiti piece on wall, urban street art aesthetic, vivid neon and primary color spray paint palette'],
  ['text', 'Graffiti style game icons, 6 game icons in graffiti mural style on transparent background: a graffiti-style game controller, a dripping spray paint heart, a wild-style game controller, a dripping gold coin, a flame icon, a star badge — all with visible spray paint texture and drip effects, vibrant urban street art game aesthetic'],

  // ── 20. Paper Cut-out / Stop Motion ─────────────────────────────────────────────
  ['text', 'Paper cut-out style game character art, a warrior character designed as layered paper cut-outs, visible paper layers stacked with slight shadows between them, torn paper edges visible, flat colors on construction paper textures, subtle drop shadow suggesting depth, warm earthy paper palette of brown cream and red, stop motion Laika animation aesthetic'],
  ['text', 'Paper cut-out style game environment art, a forest scene in layered paper cut-out style, multiple layers of trees and foliage with visible paper thickness and shadows between layers, paper texture visible on leaves, cut paper edges, warm sunset lighting, soft paper cut-out aesthetic, stop motion parallax depth effect'],
  ['text', 'Paper cut-out style game props, 4 items in paper cut-out style on dark background: a leather-bound book made of layered brown paper, a golden crown made of cut gold paper, a sword made of layered silver paper with visible paper thickness, a potion bottle of layered blue and green paper — all with paper texture visible, warm earthy cut-paper aesthetic'],
];

console.log(`准备入队 ${prompts.length} 条多风格游戏提示词...\n`);

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

const queue = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs GROUP BY status").all();
console.log('\n=== 当前队列状态 ===');
queue.forEach(r => console.log(`  ${r.status}: ${r.c}`));

db.close();