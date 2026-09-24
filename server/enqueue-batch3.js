#!/usr/bin/env node
/**
 * enqueue-batch3.js — 第三批多样化提示词
 * 覆盖：产品摄影、CG渲染、概念环境、游戏UI、古典艺术等新方向
 */
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const prompts = [
  // ── Product & Commercial Photography ─────────────────────────────────────
  ['text', 'A luxury perfume bottle on a mirror surface, the bottle is faceted crystal with amber liquid visible inside, the reflection creates an infinite tunnel effect, soft studio lighting from above, luxury fragrance product photography, elegant and aspirational, minimalist luxury'],
  ['text', 'A sneaker floating in a void space, dramatic three-quarter angle, extreme detail on the shoe texture, bold colorways, the shoe is surrounded by a faint glow, studio product photography for a footwear brand, clean and impactful product shot'],
  ['text', 'An open cosmetics bag on a marble surface, every product visible: lipsticks in various shades, mascara, eyeshadow palettes, perfume, a mirror inside the lid reflecting the products, luxury beauty flat lay, warm natural light, aspirational beauty photography'],
  ['text', 'A mechanical watch macro shot, showing the movement through the transparent caseback, every gear and spring visible and in perfect mechanical order, studio macro watch photography, dramatic lighting to show movement detail, luxury horology'],
  ['text', 'A dramatic food photograph of a giant beef burger on a red checkered paper background, over-the-top toppings: bacon, cheese, lettuce, tomato, pickles, onion rings, the burger is enormous and imperfectly perfect, American diner food photography, bold and indulgent'],
  ['text', 'A sleek gaming laptop on a desk with RGB lighting, the screen displaying an intense action game scene, RGB keyboard and mouse glowing, cables organized with care, moody dark room with neon lighting, gaming setup product photography, aspirational tech gamer aesthetic'],
  ['text', 'A bicycle leaning against an old brick wall in an alley, the bicycle is vintage and beautifully maintained, a cafe with warm light visible through the window behind, evening urban atmosphere, lifestyle bicycle photography, European city cycling culture'],
  ['text', 'An exploded view product diagram of a classic mechanical keyboard, every keycap, switch, PCB, and frame floating in a precise arrangement, technical product illustration style, clean white background, engineering product design visualization'],

  // ── CG & 3D Render ────────────────────────────────────────────────────────
  ['text', 'A 3D rendered scene of a futuristic cityscape at night, volumetric fog between buildings, neon signs, flying cars in the distance, rain on camera lens creating lens flares, Unreal Engine 5 quality cinematic render, Blade Runner inspired city at night, hyper-detailed cyberpunk city'],
  ['text', 'A Pixar-style 3D animated character portrait, a wise old owl wearing tiny round glasses, expressive eyes with depth and character, soft fur texture rendered in 3D, warm studio lighting on the character, Pixar quality character animation still, heartwarming CGI character portrait'],
  ['text', 'A hyper-realistic 3D render of a Japanese koi pond, water so clear you can see every scale on every fish, lily pads, bamboo spout, reflections perfect, a dragonfly hovering above the water surface, photorealistic 3D pond render, peaceful zen koi pond'],
  ['text', 'A 3D exploded diagram of a classic sports car in mid-explosion, every part floating in precise arrangement: engine block, wheels, doors, hood, seats, the car is a sleek red European sports car, technical 3D visualization, automotive engineering diagram style, clean white background'],
  ['text', 'A 3D rendered scene inside a massive underground cave, stalactites and stalagmites with bioluminescent glow, a tiny explorer with a flashlight for scale, volumetric light rays from above, photorealistic cave exploration render, epic scale underground world'],
  ['text', 'A cel-shaded 3D scene of a samurai standing on a cliff overlooking a Japanese village, stylized anime aesthetic with clean cel-shaded shading, cherry blossoms falling in the wind, dramatic sunset sky, anime 3D render style, Shadow of the Colossus inspired scene'],

  // ── Concept Art & Environment ────────────────────────────────────────────
  ['text', 'A concept art painting of an ancient library that exists inside a giant sleeping dragon, the dragon forms the walls, the books are arranged along scaly spines, a small scholar climbing the inner architecture, fantasy concept art, dramatic candlelight, magical ancient library environment'],
  ['text', 'A concept art environment of a massive tree that is an entire city, buildings built into and around the massive trunk, bridges connecting to outer branches, lanterns and life everywhere, steampunk meets nature city design, epic fantasy arboreal city concept art'],
  ['text', 'A concept painting of a street in a flooded city, water rising to second-story windows, boats moving through streets where cars used to be, people living on rooftops, a child feeding pigeons from a rooftop garden, climate fiction concept art, hopeful yet dystopian urban flooding scene'],
  ['text', 'A concept art scene of an ancient temple half-submerged underwater, visible through clear water, pillars and stone carvings overgrown with coral and seaweed, fish swimming through doorways, shafts of light from above the surface, underwater ancient ruins concept art, serene and mysterious'],
  ['text', 'A concept art environment of a space elevator on a foreign planet, the elevator stretching from the surface through orange clouds into space, alien landscape in foreground: purple grass, strange rock formations, two moons visible, epic scale planetary engineering concept art, awe-inspiring sci-fi landscape'],
  ['text', 'A concept painting of a night market that only appears once every hundred years, mystical glowing lanterns, vendors selling strange magical goods, crowds of beings from different realms browsing together, a once-in-a-century supernatural event, magical realism concept art, vibrant and mysterious atmosphere'],

  // ── Game Art ──────────────────────────────────────────────────────────────
  ['text', 'A piece of AAA video game concept art showing a medieval blacksmith forge, the blacksmith is a giant, his tools are huge, molten metal glowing in the forge, sparks flying, raw power and craftsmanship, Dark Souls-inspired game environment concept art, dramatic forge lighting'],
  ['text', 'A game UI design for a fantasy RPG inventory screen, the interface made of aged leather and ornate metal frames, slots for items, equipped items shown on a humanoid silhouette, a parchment quest tracker on the side, fantasy RPG inventory UI design, detailed game interface art'],
  ['text', 'A piece of game concept art for a post-apocalyptic gas station, rust and decay, a single plant growing through cracked concrete, a traveler standing at the pumps looking at a map by lantern light, abandoned gas station post-apocalyptic environment art, desolate yet beautiful wasteland aesthetic'],
  ['text', 'A game character design for a fire spirit, the character is made entirely of flowing flames in humanoid form, embers floating away from the body, a hollow face of pure fire with glowing eyes, the ground beneath melting from the heat, elemental game character design, dramatic fire spirit concept art'],
  ['text', 'A top-down view of a tactical RPG battle map, a medieval battlefield with units positioned, the map styled like an illuminated manuscript, decorative borders, heraldic symbols, top-down tactical game map art, Fire Emblem-inspired tactical RPG map'],
  ['text', 'A game concept art scene of a ghost ship sailing through a starfield sky, the ship made of bone and ethereal fabric, the crew are ghostly figures, bioluminescent sea creatures in the star sea below, ethereal cosmic ghost ship concept art, hauntingly beautiful sci-fantasy ship'],

  // ── Classical & Traditional Art ─────────────────────────────────────────
  ['text', 'A painting in the style of Vermeer, a woman reading a letter by a window with light streaming in, the famous window light from the left, pearl earrings, a map on the wall behind, Vermeer quality painting, masterful golden age Dutch interior painting, warm domestic interior scene'],
  ['text', 'A painting inspired by Hokusai\'s Great Wave, a modern reinterpretation, the wave made of thousands of smaller waves, each small wave containing tiny scenes of modern life, a city visible within the foam, contemporary reimagining of classic ukiyo-e wave composition, intricate and layered'],
  ['text', 'A mural in the style of Diego Rivera, depicting a scene of a modern technology company, workers at computers, servers in the background, Rivera\'s bold flat-color mural style, Mexican muralism aesthetic, workers and technology theme, political art style mural'],
  ['text', 'A painting in the style of Turner, a maritime disaster scene, a ship caught in a storm, Turner\'s characteristic swirling clouds, his signature blaze of light breaking through dark storm, Turner seascape painting style, dramatic and romantic maritime painting, raw nature\'s power'],
  ['text', 'A painting in the style of Monet\'s water lilies, a huge canvas showing a pond surface covered in lily pads and floating flowers, the reflections are impressionist blurred color, the sky barely visible through the foliage, Monet\'s pond series aesthetic, serene French garden Impressionism'],
  ['text', 'A painting in the style of Gustav Klimt, a portrait of a woman with intricate gold leaf patterns in her hair, elaborate decorative gold patterns on her dress, the background in Klimt\'s signature golden mosaic style, Klimt portrait aesthetic, opulent golden portrait painting'],

  // ── Street & Urban Photography ───────────────────────────────────────────
  ['text', 'An American suburb at the golden hour of suburban life, the street is completely empty, lawns perfectly maintained on both sides, houses with picket fences, a bicycle leaning against a tree, the light is that magic late afternoon golden glow, suburban American nostalgia photograph, quiet American neighborhood'],
  ['text', 'A brutalist housing complex viewed from directly below, the perspective so extreme the buildings look like they\'re falling toward you, a single laundry line with clothes snapping in the wind, harsh urban architecture, minimalist dramatic urban photography, Soviet-style block housing'],
  ['text', 'A New York City fire escape scene, a plant growing on every ledge, the plants creating a green cascade down the brownstone facade, a cat on one of the ledges, warm brick wall, a resident watering the plants, intimate New York street photography, living fire escape garden'],
  ['text', 'An underground metro station in Moscow, ornate Soviet-era chandeliers hanging in the underground station, marble columns, ornate mosaics, dramatic Soviet grandeur underground, Moscow metro at its most magnificent, the feeling of subterranean grandeur'],
  ['text', 'A narrow alley in Havana Cuba, vintage American cars parked, colorful peeling paint on the buildings, laundry hanging between windows, people sitting on stoops, a man playing guitar, vibrant warm colors, authentic Cuban street photography, lived-in street atmosphere'],
  ['text', 'A futuristic underground city, the street level is completely covered, people descending a massive staircase into an underground metropolis, skyscrapers built downward into the earth, bioluminescent lighting, solarpunk underground city concept art, inverted urban future architecture'],

  // ── Night & Astrophotography ───────────────────────────────────────────────
  ['text', 'The Milky Way photographed from a dark sky location, the galactic core directly overhead, thousands of stars visible, a lone figure lying on a blanket looking up at the sky, the landscape below is a salt flat creating a mirror reflection of the sky, astrophotography landscape, perfect dark sky Milky Way reflection'],
  ['text', 'A long-exposure photograph of a lighthouse at night, the beam sweeping across a calm sea, a rocky coastline, stars creating trails in the sky from the long exposure, dramatic night seascape photography, maritime lighthouse at night with star trails, atmospheric coastal night photography'],
  ['text', 'A city skyline photographed from across a river at blue hour, every window in the buildings lit, perfect reflection in the still river, a bridge connecting both shores, the sky is that perfect deep blue that only lasts minutes, urban cityscape blue hour photograph, city reflection in water'],
  ['text', 'A meteor shower over an ancient stone circle, the stones silhouetted against the star trails, meteors streaking across the frame, ancient megalithic site meeting cosmic event, dark sky astrophotography, ancient human architecture meeting cosmic phenomena, stone circle astrophotography'],
  ['text', 'A night street photograph of a neon-lit izakaya in Tokyo at 2am, steam and smoke escaping through the open front, warm orange neon signs, a lone cook visible inside, the street empty and rain-wet, intimate Tokyo nightlife at its quietest moment, atmospheric Tokyo night street photography'],

  // ── Extreme & Macro ───────────────────────────────────────────────────────
  ['text', 'A macro photograph of water droplets on a leaf at sunrise, each droplet contains a perfect inverted landscape of the garden behind, dewdrop photography at its most technically perfect, macro nature photography, each drop a tiny world'],
  ['text', 'A macro photograph of a bee covered in pollen on a purple flower, the pollen grains visible as individual golden spheres, the bee\'s compound eyes showing hexagonal structure, extreme macro insect photography, nature\'s microscopic detail, technically perfect bee on flower macro'],
  ['text', 'A macro photograph of rust on metal, showing the complex fractal patterns of oxidation, red and orange and brown patterns like a natural landscape, macro texture photography, abstract natural beauty in corrosion, macro rust pattern close-up, organic patterns in aged metal'],
  ['text', 'A macro photograph of a snowflake under cross-polarized light, the internal crystal structure revealed in vivid rainbow colors, extreme macro snowflake photography, scientific beauty in nature, snowflake internal structure revealed through polarized light, mathematically perfect ice crystal structure'],

  // ── Landscapes ─────────────────────────────────────────────────────────────
  ['text', 'The northern lights over a frozen Icelandic waterfall, the aurora green and purple reflected in the frozen falls, the ice and snow creating a white foreground, long-exposure landscape photography, epic Iceland winter landscape, aurora borealis over waterfall'],
  ['text', 'A salt flat in Bolivia at sunrise, the salt surface is a perfect mirror reflecting the sky, the sky is pastel pink and blue gradient, no horizon line visible — just one continuous field of sky and ground, Salar de Uyuni mirror reflection photograph, surreal landscape at its most minimal'],
  ['text', 'A vast red sand dune in the Sahara Desert at sunrise, the dune has a perfect crest line stretching to the horizon, one set of footprints walking away from camera, the desert completely silent and empty, perfect symmetry in a sand dune, minimal vast desert landscape'],
  ['text', 'An Icelandic lava field covered in vibrant green moss, the moss is so thick and soft it looks like velvet, black volcanic rock visible beneath, a mist rolling through the field, otherworldly Icelandic landscape, green moss on black rock, surreal landscape photography'],
  ['text', 'A rice terrace landscape in Bali at sunrise, tiered green rice paddies carved into a hillside, the water in each terrace reflecting the sky, a farmer working in the lower terraces, Indonesian landscape photography, Bali rice terrace at dawn, lush green terraced hillside'],
  ['text', 'A dramatic photograph of a sea stack off the coast of Norway, a massive vertical sea stack rising from the sea, seabirds nesting on the ledges, the sea crashing at the base, a small boat for scale, epic coastal Norwegian landscape photography, dramatic sea stack in rough Norwegian sea'],

  // ── People & Lifestyle ───────────────────────────────────────────────────
  ['text', 'A portrait of a grandmother teaching her granddaughter to make dumplings in a warm kitchen, flour-dusted hands, the grandmother guiding the granddaughter\'s hands, afternoon kitchen light, generational cooking tradition, warm domestic family scene, authentic generational kitchen portrait'],
  ['text', 'A candid photograph of a street vendor in Mexico City making elotes, the corn on the cob charred and covered in mayo cheese and chile, the vendor\'s hands perfectly stained with butter and seasoning, the grill smoking behind, authentic Mexican street food, steam and fire, street vendor portrait'],
  ['text', 'A portrait of a tattoo artist in their studio, covered in their own tattoos, focused completely on the piece they are creating on a client, the tattoo machine buzzing, every surface covered in art and equipment, creative workspace portrait, tattoo artist at work in their element'],
  ['text', 'A photograph of three generations of fishermen pulling a net on a beach at dawn, great-grandfather, grandfather, father, and child all working together, the net full of silver fish, dawn light catching the spray, generational fishing tradition, golden hour work scene'],
  ['text', 'A portrait of a woman surfer standing on a board in the ocean at dawn, long hair wet and free, the ocean flat and calm around her, warm dawn light on her face, peace and power, female surfer at dawn, empowering ocean portrait, surf culture photography'],
  ['text', 'A photograph of a traditional bookbinder at work in a workshop, a large hand-operated book press, leather hides hanging on the wall, the craftsman\'s hands pressing marks into leather, warm workshop light, traditional bookbinding craft, artisanal handcraft portrait'],

  // ── Fantasy Creatures ─────────────────────────────────────────────────────
  ['text', 'A phoenix rising from its own ashes, the bird is pure flame and gold and crimson, feathers of fire creating a crown shape, the ashes below glowing orange, rebirth moment, mythical phoenix art, dramatic fire bird rising from flames, magical creature concept art'],
  ['text', 'A dragon in a mountain cave, the dragon is sleeping, its scales shift between stone and metal, a small human explorer carefully stepping past, the dragon\'s eye barely open watching the human, the human holds a tiny light, dragon and human scale contrast, Game of Thrones scale dragon in cave'],
  ['text', 'A kraken surfacing from a stormy sea near a sailing ship, tentacles the size of the ship\'s mast, the ship\'s crew in panic on deck, dark storm clouds, lightning illuminating the massive creature, dramatic sea monster scene, giant squid emerging from stormy ocean'],
  ['text', 'An ethereal forest spirit, a figure made entirely of deer antlers, bark-like skin, flowers growing from the hair, moss covering the shoulders, deer-like eyes in a humanoid face, the spirit is stepping through a forest at night lit by bioluminescence, nature spirit guardian concept art, ethereal forest deity'],
  ['text', 'A tiny house tucked inside a giant hollowed-out tree, the door is the tree\'s entrance, the tree has been grown into a home over centuries, smoke rising from a small chimney, a winding staircase carved into the trunk, the tree is massive, a hobbit-house aesthetic but grown from an ancient oak, fantasy tree house concept art'],
  ['text', 'A mermaid combing her hair in a tidal pool surrounded by coral, her tail scales shimmer in every color, tropical fish surrounding her, she has a crown of sea anemones, bioluminescent deep sea elements, enchanting underwater mermaid scene, magical ocean creature portrait'],

  // ── New Categories ─────────────────────────────────────────────────────────
  ['text', 'A dental photography close-up of a perfectly healthy set of teeth, bright white and aligned, dramatic clinical lighting making the teeth glow, dental health photography, the beauty of a healthy smile under professional clinical photography, stark white and blue clinical tones'],
  ['text', 'A forensic science visualization, a crime scene investigation diagram showing the position of evidence markers around a body outline, precise forensic markers, evidence being catalogued, technical forensic photography style, blue lighting, forensic science aesthetic visualization'],
  ['text', 'A macro photograph of a smartphone screen showing an app interface, extreme close-up where individual pixels are barely visible, the glass surface reflecting the camera, technology macro photography, smartphone screen detail, the uncanny valley of technology macro'],
  ['text', 'A medical anatomy visualization of a human heart, the heart in dramatic perspective, veins and arteries color-coded, the heart floating in deep black space, medical illustration meets art, anatomical art visualization, dramatic medical anatomy render'],
  ['text', 'A data visualization art piece, complex network of nodes and edges in 3D space, the nodes glow in different colors and sizes representing data importance, a dark background with particles floating, data art visualization, beautiful data network art, complex information design as art'],
  ['text', 'A fashion runway photograph from the back of the stage, the model walking away from camera, the audience visible only as silhouettes, dramatic runway lighting making the model\'s silhouette the star, fashion week runway photography, behind-the-scenes runway perspective'],
];

console.log(`准备入队 ${prompts.length} 条第三批提示词...\n`);

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
    console.log('  +', promptText.slice(0, 55));
  } catch(e) {
    failed++;
    console.log('  x', e.message.slice(0, 50));
  }
}

console.log(`\n成功: ${added}  |  失败: ${failed}`);

const q = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs GROUP BY status ORDER BY status").all();
console.log('\n=== 队列状态 ===');
q.forEach(r => console.log('  ' + r.status + ': ' + r.c));

db.close();