#!/usr/bin/env node
/**
 * Enqueue a massive diverse batch of prompts — ALL categories.
 * Portraits, food, architecture, fashion, sci-fi, nature, typography, posters, etc.
 * Run: node enqueue-diverse-all.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const prompts = [
  // ── Portraits & Faces ────────────────────────────────────────────────────
  ['text', 'A close-up portrait of an elderly woman with deep character lines, silver hair tied back, wearing a vibrant floral headscarf, warm golden window light on one side, the other side in deep shadow, photorealistic, documentary photography style, raw and honest beauty, rich warm tones'],
  ['text', 'A portrait of a street musician playing violin in a rainy city alley at night, neon reflections on wet pavement, a streetlamp casting dramatic orange light, blurred city lights in background, cinematic street photography, moody atmospheric portrait'],
  ['text', 'A portrait in renaissance oil painting style, a noble woman with intricate pearl jewelry, rich velvet dress in deep burgundy, dramatic chiaroscuro lighting, oil paint texture visible, restored masterwork quality, warm candlelight atmosphere'],
  ['text', 'A double exposure portrait, a woman face simultaneously showing an outer cityscape through the face silhouette, surreal photomontage art, dark background with golden city glow, artistic double exposure photography concept'],
  ['text', 'A portrait of a child with the most expressive eyes, looking directly at camera with complete joy, natural window light, freckled skin, messy hair, photojournalism style, raw genuine emotion, no studio lighting'],
  ['text', 'A cyberpunk character portrait, a person with half their face replaced by chrome cybernetic implant, neon blue light glowing from cybernetic eye, other side of face completely human and vulnerable, dramatic contrast, sci-fi portrait photography'],
  ['text', 'A large group portrait of fifteen people from different cultures laughing together, candid moment, outdoor golden hour light, diverse ages and backgrounds, warm documentary photography, genuine human connection'],
  ['text', 'A portrait of a blind elderly man with closed eyes, holding a vintage camera, warm smile lines, textured weathered skin, silver beard, natural light, empathetic portrait, timeless photography style'],
  ['text', 'An underwater portrait of a freediver looking up through the water surface, shafts of light from above, bubbles surrounding the face, blue-green water tones, ethereal and meditative atmosphere, surreal underwater photography'],
  ['text', 'A portrait in pure silhouette, a figure standing at the edge of a cliff at sunset, the face not visible at all — pure shape and posture telling the story, dramatic backlit silhouette, warm orange sky, emotional silhouette photography'],

  // ── Food & Cuisine ─────────────────────────────────────────────────────────
  ['text', 'A flat lay of authentic Japanese breakfast on a wooden table: miso soup in a ceramic bowl, grilled salmon, tamago, pickled vegetables, rice in a lacquered bowl, chopsticks, a cup of green tea steaming, morning sunlight from window, styled food photography, Japanese cuisine aesthetic, warm natural light'],
  ['text', 'A cross-section view of a giant gourmet burger, showing all layers: toasted brioche bun, lettuce, tomato, cheese, patty, pickles, sauce — like an architectural exploded diagram, vibrant food photography, studio lighting, appetizing bold colors'],
  ['text', 'A moody atmospheric food photograph of ramen in a dark ceramic bowl, steam rising, soft shadowy background, a single dramatic light source from above illuminating the bowl, chopsticks resting across the top, Japanese ramen shop aesthetic, cinematic dark food photography'],
  ['text', 'An overhead flat lay of an Italian market spread: various cheeses, prosciutto, olives, fresh bread, wine in dark bottle, tomatoes, basil, rustic wooden surface, rich warm colors, natural organic food photography, abundant Italian feast aesthetic'],
  ['text', 'A macro detail photograph of coffee being poured from a French press, the dark liquid falling in a perfect stream, light catching the surface of the coffee, steam rising, warm brown tones, cozy morning atmosphere, artful coffee photography'],
  ['text', 'A dramatic chocolate cake cross-section at the moment of cutting, the knife entering the cake, layers revealed — sponge, cream, ganache, chocolate shavings falling, rich dark chocolate colors, dark moody food photography with warm lighting, indulgent dessert aesthetic'],
  ['text', 'A Mexican street food spread: tacos al pastor with pineapple, guacamole, salsa verde, lime wedges, hot sauce bottles, paper napkins, colorful vibrant food photography, authentic street food atmosphere, warm rich colors'],
  ['text', 'A single perfect croissant on a vintage plate in morning light, golden buttery layers visible in the cross-section, scattered flour on the surface, a small pot of café au lait in background, Parisian breakfast still life, warm morning light, French patisserie photography'],

  // ── Architecture & Interior ─────────────────────────────────────────────────
  ['text', 'The interior of a brutalist concrete cathedral, massive raw concrete arches, shafts of colored light from high clerestory windows, a tiny human figure for scale, raw concrete texture visible, sacred brutalist architecture, cool grey and warm light contrast, dramatic architectural photography'],
  ['text', 'A Japanese minimalist interior, a single tatami room with a low table, a scroll painting on the wall, a tokonoma alcove with a single flower arrangement, soft natural light from shoji screens, perfect negative space, wabi-sabi aesthetic, serene Japanese interior photography'],
  ['text', 'An abandoned grand ballroom reclaimed by nature, vines growing through broken chandeliers, wildflowers growing on the marble dance floor, sunlight streaming through a collapsed roof, ancient beauty in decay, melancholic romantic atmosphere, dramatic architectural decay photography'],
  ['text', 'A narrow traditional Venetian calle at golden hour, buildings leaning toward each other creating a perspective tunnel, laundry hanging between windows, warm orange evening light, a single person walking away into the calle, atmospheric Italian street photography'],
  ['text', 'A futuristic eco-city building, vertical gardens covering all surfaces, trees growing from every balcony and rooftop, solar glass panels, birds nesting in the vegetation, a person standing on a sky garden terrace, sustainable future architecture, vibrant green and modern glass contrast'],
  ['text', 'The interior of a Moroccan riad, courtyard with central fountain, intricate zellige tile work in blue and terracotta, carved stucco walls, colored glass lanterns, orange tree in center, warm afternoon light, rich texture and pattern, exotic interior photography'],
  ['text', 'A brutalist housing block seen from below against a stormy sky, strong perspective converging upward, harsh geometric shadows, a single bird flying near the top, overwhelming scale, dramatic stormy weather, stark architectural photography'],
  ['text', 'A modern treehouse Airbnb interior, floor-to-ceiling glass walls with forest views, a hanging chair, warm wood interior, string lights, books on shelves, a fireplace with a warm glow, a cat sleeping in a sunbeam, cozy modern cabin interior, warm and inviting atmosphere'],

  // ── Fashion & Clothing ────────────────────────────────────────────────────
  ['text', 'A fashion editorial photograph of a model in a flowing midnight blue silk gown walking through rain on a city street, streetlights creating lens flares in rain droplets, dramatic fashion photography, wet pavement reflections, moody and romantic, haute couture editorial aesthetic'],
  ['text', 'A flat lay of minimalist designer clothing on a concrete floor: a cream cashmere sweater, tailored black trousers, leather boots, a designer handbag, minimal accessories, stark white and grey background, luxury minimal fashion photography, clean and elevated'],
  ['text', 'A street style photograph of a person in bold maximalist fashion, clashing patterns and colors deliberately mixed, layered clothing, statement jewelry, confident expression, urban street photography, fashion week candid style, bold colorful maximalist look'],
  ['text', 'A wedding dress on a mannequin in a sunlit atelier, the dress is intricate handmade lace with floral appliques, tulle layers catching the light, dressmakers dummy in a dusty sunbeam, behind-the-scenes bridal atelier atmosphere, soft romantic light, bridal fashion photography'],
  ['text', 'A close-up of artisan leather shoes being hand-crafted, the craftsman hands working the leather, tools spread on a workbench, rich leather smell implied by rich brown tones, detailed craft photography, heritage shoemaking, warm workshop light, artisanal quality'],
  ['text', 'A fashion illustration of a collection inspired by ocean waves, flowing garments with draped fabric looking like sea foam, monochromatic blue palette, fashion croquis style with dynamic pose, hand-drawn fashion illustration on cream paper, fashion design sketch aesthetic'],
  ['text', 'A portrait of a person in traditional cultural clothing from a specific culture, rich textile detail, handmade embroidery visible, cultural jewelry, the clothing treated with respect and authenticity, documentary style portrait celebrating cultural heritage, warm natural light'],
  ['text', 'An avant-garde fashion garment made entirely of recycled materials, bottles, newspaper, cardboard sculpted into a dramatic sculptural dress, editorial fashion photography, conceptual sustainable fashion, bold creative design, studio lighting'],

  // ── Nature & Wildlife ─────────────────────────────────────────────────────
  ['text', 'A lioness portrait in the golden hour before a hunt, intense amber eyes, individual whisker details, her face in perfect focus with a blurred golden African savanna behind, documentary wildlife photography at its finest, warm golden light on tawny fur, predatory intensity'],
  ['text', 'A hummingbird in mid-flight during a nectar stop, wings a blur of motion, iridescent green and ruby throat feathers sharp and detailed, a flower in the background, freeze-frame wildlife photography, nature in motion, vibrant color, technical mastery'],
  ['text', 'An aerial photograph of a winding river through a pristine wilderness valley, turquoise water against green forest, no human presence, nature untouched and wild, aerial landscape photography, epic scale nature, remote and beautiful wilderness'],
  ['text', 'A single perfect dewdrop on a spider web at sunrise, the web threads holding the drop like a diamond, every thread in perfect focus, the web connecting two blades of grass, macro nature photography, extreme detail, natural beauty in the smallest scale'],
  ['text', 'A wolf standing on a snowy ridge silhouetted against a full moon, snow dust floating in the air, dramatic backlit silhouette, blue-white moonlit night, powerful lone wolf presence, dramatic nature photography, stark cold winter atmosphere'],
  ['text', 'A coral reef scene from below looking up at the surface, fish swimming through sunbeams piercing the water, vibrant coral colors, deep blue ocean water above, underwater photography, living coral ecosystem, rich biodiverse reef scene'],
  ['text', 'A thunderstorm over open prairie, massive supercell storm cloud dominating the sky, lightning striking in the field, dramatic natural violence, long exposure storm photography, epic atmospheric landscape, dark ominous clouds with warm ground light'],
  ['text', 'A macro photograph of a butterfly emerging from a chrysalis, the butterfly still soft and unfolding its wings, the empty chrysalis shell nearby, nature transformation moment, extreme close-up detail, soft natural light, butterfly emergence photography'],

  // ── Sci-Fi & Technology ───────────────────────────────────────────────────
  ['text', 'A massive generation ship traveling through a nebula, the ship is the size of a city with massive rotating rings for artificial gravity, the nebula fills the background in purple and orange, stars visible, epic scale science fiction concept art, cinematic sci-fi landscape'],
  ['text', 'A cyberpunk street vendor robot in a neon-lit alley, a small robot with expressive eyes selling bootleg data chips, rain on chrome body, neon reflections in puddles, steam from street vents, a human customer negotiating, Blade Runner meets Wall-E, atmospheric sci-fi street scene'],
  ['text', 'An alien planet surface with two moons in the sky, the landscape is deep crimson sand dunes, strange bioluminescent plants, an alien creature with many legs drinking at a bioluminescent pool, alien world concept art, warm rust-red and cool blue contrast, exotic sci-fi landscape'],
  ['text', 'A space station interior, a vast rotating ring creating artificial gravity, earth visible through a large window, ships flying past, people walking on the inner surface of the ring with heads pointing outward, O\'Neill cylinder space habitat concept, hopeful realistic space colonization art'],
  ['text', 'A close-up of a neural interface chip being implanted in a human hand, the chip glowing blue inside the palm, delicate surgery scene, high-tech medical procedure, cyberpunk sci-fi technology, dramatic medical technology photography, blue and silver palette, transhumanist concept'],
  ['text', 'An ancient alien megastructure on a planet surface, geometric shapes the size of mountains, covered in mysterious symbols, a lone human archaeologist examining it with tools, the structure stretches to the horizon, mysterious alien archaeology sci-fi scene, epic scale alien ruins'],
  ['text', 'A futuristic city where the entire city is a living tree structure, buildings grown from giant engineered trees, people living in tree houses connected by living bridges, zero pollution, a small drone flying between the organic buildings, solarpunk green city concept art, utopian technology meets nature'],
  ['text', 'A robot artist painting a canvas in a studio, mechanical arms holding brushes with visible precision, paint splatters around the studio, the painting on the canvas is abstract and beautiful, a small audience watching in wonder, AI and art concept, warm studio light, thought-provoking sci-fi scene'],

  // ── Typography & Lettering ───────────────────────────────────────────────
  ['text', 'A hand-lettered alphabet in a vintage circus poster style, each letter is a different bright bold circus font, gold and red and black color scheme, decorative flourishes and borders, vintage carnival typography poster art, ornate hand-drawn lettering'],
  ['text', 'Modernist architectural typography design, each letter formed by shadows cast by 3D geometric letterforms, bold black letters on white background, dramatic shadow photography, modernist design typography, clean and striking, light and shadow typography art'],
  ['text', 'A chinese calligraphy scroll with flowing ink brush calligraphy, the characters showing mastery of the brush stroke, individual strokes visible as artistic expressions, rice paper texture, ink sumi-e style, traditional east asian calligraphy art, black ink on warm paper'],
  ['text', 'A neon sign in a dark room forming an inspirational word, glowing brightly against deep shadow, the neon tubes and their reflections creating a dramatic text art piece, neon sign photography, glowing warm and cool colors, atmospheric dark typography'],
  ['text', 'A street wall covered in graffiti letter tags, dozens of different tag styles by different artists layered over each other, bold colors, wild style bubble letters, urban typography collage, vibrant street art typography, urban wall texture'],
  ['text', 'A wedding invitation with elegant calligraphy lettering in gold ink on cream card stock, floral watercolor illustrations surrounding the text, wax seal on the back, layered flat lay design, luxury elegant stationery design, romantic wedding typography'],

  // ── Poster & Editorial Illustration ───────────────────────────────────
  ['text', 'A vintage travel poster for a fictional destination, an art deco style illustration of a tropical beach with stylized palm trees, bold geometric sun, vintage typography "Paradise Isle", limited color palette of teal and coral, 1930s travel poster aesthetic'],
  ['text', 'A movie poster for a psychological thriller, a silhouette of a person in an empty room with one light on, the shadow on the wall shows something that is not there, dramatic minimalist poster design, bold typography, high contrast black and white with a single red element, cinematic poster art'],
  ['text', 'An editorial illustration for an article about climate change, a surrealist image of a melting clock lying on a dead coral reef, artistic magazine cover illustration, bold graphic style, striking conceptual art, magazine editorial illustration'],
  ['text', 'A vintage rock concert poster, a psychedelic illustration of a band playing with swirling colors and patterns behind them, bold retro typography, 60s and 70s rock poster aesthetic, warm saturated colors, trippy visual design, vintage concert poster'],
  ['text', 'A children\'s book illustration, a whimsical scene of a dragon living in a library, the dragon sleeping on top of a pile of books, books scattered everywhere, warm cozy colors, illustrated storybook style, detailed and charming, children\'s book illustration art'],
  ['text', 'An editorial illustration for an article about AI and creativity, a robot hand holding a paintbrush creating a galaxy painting on canvas, futuristic and artistic, magazine cover quality illustration, bold colors and composition, conceptual editorial art'],
  ['text', 'A concert poster for a jazz festival, an art deco style illustration of a jazz musician with saxophone, geometric patterns, vintage jazz poster aesthetic, bold teal and gold color scheme, sophisticated jazz club mood, vintage jazz poster design'],
  ['text', 'A horror movie poster, a dark figure standing in an open field at night with a full moon behind, the figure has no face, the shadows are wrong, dramatic horror poster composition, high contrast black and white, bold red title treatment, cinematic horror poster art'],

  // ── Abstract & Fine Art ───────────────────────────────────────────────────
  ['text', 'An abstract expressionist painting, massive dynamic brush strokes in bold colors, thick impasto texture visible in the paint, red blue and yellow in violent composition, Jackson Pollock-inspired abstract action painting, gallery artwork feel, raw creative energy'],
  ['text', 'A minimalist abstract piece, perfect concentric circles of color on a white background, each circle slightly different in texture and color, precise mathematical geometry, contemplative art, clean and meditative, gallery wall ready minimalism'],
  ['text', 'An abstract piece inspired by music, the composition showing sound waves as physical color ribbons flowing across the canvas, each color corresponding to a different musical note, synesthetic abstract painting, bold colorful musical abstraction, energetic abstract art'],
  ['text', 'A large-scale abstract mural on an urban brick wall, geometric shapes in bold primary colors, strong lines and forms, street art style abstract, vibrant urban art, bold graphic street mural, modern abstract public art'],
  ['text', 'An abstract ink wash painting in traditional Chinese style, large areas of black ink on rice paper, showing a landscape in complete abstraction, bold confident brushstrokes, sumi-e influenced abstract art, minimalist eastern aesthetics, ink on paper fine art'],
  ['text', 'A mixed media abstract artwork, collage elements combined with paint, found text, photographs, layered texture, each area of the piece tells a different story, mixed media fine art, rich layered composition, gallery-quality abstract mixed media'],

  // ── Historical & Period Scenes ───────────────────────────────────────────
  ['text', 'A street scene in 1920s Paris, a fashionably dressed couple in Art Deco clothing walking along the Seine at sunset, iconic Paris bridges in background, vintage photograph quality with period-accurate details, warm golden hour light, nostalgic romantic period illustration'],
  ['text', 'A scene of ancient Rome at the height of the empire, a marketplace in a Roman forum, merchants selling goods, citizens in togas, a senator passing in a litter, detailed historical scene, warm Mediterranean light, epic Roman period illustration'],
  ['text', 'A Japanese ukiyo-e inspired scene of Edo period Tokyo, a samurai walking through a snow-covered garden, traditional architecture in background, cherry blossoms falling despite the snow, woodblock print color palette, Edo period Japanese scene, traditional art style'],
  ['text', 'A scene of ancient Egypt, laborers building a pyramid, massive stone blocks being moved with primitive technology, the pyramid rising in the background, harsh desert sun, detailed historical reconstruction art, warm sand and stone colors, ancient Egyptian architecture construction'],
  ['text', 'A Victorian industrial revolution street scene, steam engines and horse carriages sharing the same road, factory smokestacks in background, people in Victorian clothing, cobblestone streets, historical period illustration, warm gaslight tones, industrial age atmosphere'],
  ['text', 'A scene from the golden age of piracy, a pirate ship in a tropical harbor, pirates unloading treasure, a tavern visible on the shore, tropical sunset lighting, detailed period illustration, warm Caribbean palette, adventurous pirate era scene'],

  // ── Music & Instruments ───────────────────────────────────────────────────
  ['text', 'An acoustic guitar lying on a weathered leather couch in a dimly lit studio, warm amber light from a nearby window, dust particles floating in the light beams, the guitar is well-worn and loved, musician\'s studio atmosphere, warm nostalgic music photography'],
  ['text', 'A grand piano in a mansion library with evening light coming through tall windows, the piano lid open, sheet music on the stand showing a beloved piece, warm golden light, elegant library interior, classical music atmosphere, refined piano photography'],
  ['text', 'A collection of hand percussion instruments from around the world spread on a table: djembe from West Africa, tabla from India, Cajon from Peru, berimbau from Brazil, bongos from Cuba, world music instruments, cultural music photography, rich textures and colors'],
  ['text', 'A close-up of violin craftsmanship, the front of a violin being carved by hand, the wood grain visible, chisel in craftsman\'s hand, workshop atmosphere, warm wood tones, violin making process photography, artisanal music instrument craft'],
  ['text', 'A vinyl record spinning on a turntable, the tonearm in mid-play, dramatic side-lighting catching the grooves, a warm orange glow from a nearby lamp, a moody music photography scene, the intimacy of analog music listening, warm vinyl record photography'],
  ['text', 'A street musician playing an enormous handmade instrument in a European plaza, the instrument is a hybrid of guitar and violin, crowds gathering around, golden afternoon light, street music scene, passionate artistic performance, European cultural street music photography'],

  // ── Sports & Activities ───────────────────────────────────────────────────
  ['text', 'A dramatic long-exposure photograph of a marathon runner at night, light trails behind the runner showing motion, city street lights creating bokeh, endurance race atmosphere, nighttime urban sports photography, inspiring athletic moment'],
  ['text', 'A scene of traditional Japanese tea ceremony, a host and guest in a tatami room, precise and meditative, the tea bowl held with both hands, soft natural light from a paper screen, calm atmosphere, detailed cultural activity photography, serene Japanese tradition'],
  ['text', 'A bird\'s-eye view of a beach volleyball game in progress, sand flying, players in dynamic athletic poses, intense competition, overhead sports photography, tropical beach setting, energetic summer sports scene'],
  ['text', 'A climber on a sheer rock face at sunset, the climber tiny against the massive rock wall, clouds below, the last golden light on the climber, dramatic outdoor climbing photography, wilderness adventure, inspiring climbing moment at golden hour'],
  ['text', 'A scene of competitive chess players in a tournament hall, one player in deep thought holding a piece, the opponent waiting, dramatic lighting on the faces, tournament chess atmosphere, intellectual competition, tense moment photography'],
  ['text', 'A group of elderly people practicing tai chi in a park at dawn, synchronized slow movement, morning mist, the city skyline in background, serene wellness activity, peaceful morning atmosphere, healthy lifestyle photography'],

  // ── Travel & Landmarks ────────────────────────────────────────────────────
  ['text', 'The Taj Mahal at sunrise from across the reflecting pool, the white marble glowing in the golden sunrise light, perfect symmetry, mirror-perfect reflection in the pool, iconic landmark photography, warm sunrise tones, breathtaking Indian monument at dawn'],
  ['text', 'The Eiffel Tower in a rainstorm viewed from below looking straight up, the tower disappearing into dark stormy clouds, rain streaks visible in the air, dramatic atmospheric urban landmark photography, moody Paris photography, stormy atmospheric contrast'],
  ['text', 'A street scene in a traditional Japanese alley (Yokochō) at night, paper lanterns glowing, izakaya bars on both sides, people eating and drinking, steam from cooking food, warm glowing atmosphere, nighttime Japanese street photography, authentic Tokyo nightlife'],
  ['text', 'A aerial photograph of Santorini at sunset, white-washed buildings cascading down the cliff to the sea, blue domes of churches, the caldera visible, golden sunset light, iconic Greek island aerial view, breathtaking Mediterranean island photography'],
  ['text', 'An ice hotel interior in northern Scandinavia, all furniture and walls made of ice, guests wrapped in reindeer furs sitting on ice chairs, warm candlelight against the cold blue ice, surreal ice architecture, contrasting warm-cold interior photography'],
  ['text', 'A busy crossing in Tokyo at night during a rainstorm, pedestrians crossing in all directions, neon signs reflected in wet pavement creating a kaleidoscope of color, the famous Shibuya scramble crossing at night, vibrant Japanese city night photography, overwhelming urban energy'],
  ['text', 'A peaceful Buddhist monastery in the Himalayas at sunrise, prayer flags stretched between stone walls, snow-capped peaks in background, a monk walking in the courtyard, incense smoke, clear mountain air atmosphere, Tibetan Buddhist monastery sunrise photography'],
  ['text', 'A Venetian water canal at dawn, no tourists, just a local in a small boat, the buildings casting long morning shadows, a single bridge crossing the canal, mist rising from the water, authentic Venice at dawn, quiet romantic atmosphere, golden morning light on ancient stone'],

  // ── Pets & Animals ─────────────────────────────────────────────────────────
  ['text', 'A golden retriever in a field of sunflowers at golden hour, the dog running joyfully through the flowers, petals flying, happy carefree moment, warm golden light, summer pet photography, joyful dog photography, golden field and golden retriever perfect match'],
  ['text', 'A cat portrait with intense green eyes, the cat sitting on a vintage velvet chair, detailed fur texture, the eyes sharp and piercing, studio portrait lighting, elegant cat photography, atmospheric pet portrait'],
  ['text', 'A horse and foal in a paddock at sunrise, the mother horse nuzzling her newborn foal, soft morning mist, dew on the grass, tender mother-child moment, equine photography, emotional and beautiful, warm golden morning light'],
  ['text', 'A chameleon on a branch with its tongue fully extended catching an insect, the tongue a pink blur in mid-strike, incredible animal action photography, perfect timing, vibrant chameleon colors, macro wildlife moment, nature\'s precision'],
  ['text', 'A trio of elephants at a watering hole at sunset, large ears fanning, water splashing, family group, deep orange sunset reflection in the water, African wildlife photography, majestic and serene, emotional elephant family scene'],
  ['text', 'A rabbit in a wildflower meadow, perfectly camouflaged, nose twitching, alert ears, surrounded by wildflowers at their level, close-up nature photography, soft natural colors, adorable wildlife scene, rabbit in natural habitat'],
  ['text', 'A close-up of a tarantula spider on a leaf, the intricate patterns on its body visible in detail, the spider\'s multiple eyes reflecting the camera, macro wildlife photography, impressive and beautiful spider detail, nature\'s intricate design'],
  ['text', 'A husky dog in snow looking directly at camera with its striking blue eyes, snow falling gently around it, alert and beautiful, winter dog portrait photography, intense blue eyes against white snow, beautiful Siberian husky portrait'],

  // ── Seasons & Weather ─────────────────────────────────────────────────────
  ['text', 'Cherry blossoms in full bloom over a Tokyo canal at dawn, petals falling and drifting on the water surface creating pink foam, traditional boats visible, warm pink and soft blue morning palette, Japanese sakura spring scene, serene and breathtaking, iconic Japanese spring photography'],
  ['text', 'A winter forest in Finland, snow-covered trees in perfect silence, a frozen lake in the center, footprints in fresh snow, no wind, absolute stillness, cold blue-white winter atmosphere, Finnish winter landscape, peaceful snowy wilderness'],
  ['text', 'An autumn vineyard at peak color, rows of vines heavy with grapes, leaves in every shade of red orange and gold, the last harvest of the season, warm autumn light, a worker walking through the rows, French countryside autumn vineyard, rich harvest colors'],
  ['text', 'A summer thunderstorm over an open wheat field, dramatic dark storm clouds, lightning striking in the distance, a narrow shaft of sunlight breaking through to illuminate the wheat, dramatic weather photography, warm golden light in the wheat contrasting with dark storm clouds'],
  ['text', 'Spring rain on a city street, people with colorful umbrellas crossing a pedestrian crossing, reflections in puddles, soft grey ambient light, a child jumping in a puddle, urban spring weather photography, rainy day atmosphere, life continuing in the rain'],
  ['text', 'First snow of winter falling on a small European town, people bundled up, children building snowmen, warm lights from houses against cool blue-white snow, cozy winter atmosphere, small-town winter charm, festive first snow scene'],

  // ── Still Life & Objects ──────────────────────────────────────────────────
  ['text', 'A still life arrangement of vintage objects: a broken pocket watch, a letter with a wax seal, a dried flower, an old key, arranged on a worn leather book, emotional still life, nostalgic objects with history, warm candlelight, quiet contemplation, narrative still life photography'],
  ['text', 'A minimalist still life of three objects on white: a smooth stone, a twisted piece of driftwood, a single white flower in a clear glass vase, extreme simplicity, perfect composition, clean minimal still life, negative space as design element'],
  ['text', 'A vintage typewriter on a desk with a half-finished letter in the roller, a cup of coffee beside it, morning light through a window, a person\'s creative workspace, the intimacy of writing, warm cozy desk scene, writer\'s atmosphere still life'],
  ['text', 'A collection of vintage science instruments: a brass telescope, a magnifying glass, botanical illustration prints, arranged as a still life on a mahogany desk, Victorian scientific instruments, warm wood tones and brass, intellectual still life photography'],
  ['text', 'A dramatic still life of a cracked and broken antique mirror, a reflection showing a different landscape within the broken glass, surreal still life photography, broken mirror revealing another world, artistic still life with narrative element, warm and cool contrast'],
  ['text', 'A still life of ceramic pottery and natural objects on a wooden surface: a handmade clay bowl, dried wheat stalks, a peach, linen cloth, natural light from above, artisanal pottery still life, warm natural earth tones, handmade craft aesthetic'],

  // ── Emotions & Moments ────────────────────────────────────────────────────
  ['text', 'A candid photograph of two elderly people holding hands walking, the woman in a walker, deep love and tenderness in the gesture, natural street photography, genuine human emotion, golden hour light, authentic intimate moment, documentary photography'],
  ['text', 'A photograph of a child experiencing snow for the first time, eyes wide with wonder, mouth open in amazement, small hands reaching up to catch flakes, pure childlike wonder captured, emotional candid photography, heartwarming moment'],
  ['text', 'A dancer mid-performance, suspended in a perfect jump, costume flowing, face in expression of pure art, dramatic stage lighting, frozen in motion, ballet or contemporary dance photography, artistic athletic grace'],
  ['text', 'A portrait of someone crying but smiling at the same time, joy and tears together, wedding day photo of a bride, overwhelmed with happiness, raw emotion, genuine vulnerable moment, warm golden light, emotional photography'],
  ['text', 'A group of friends laughing at a table during a meal, heads thrown back in genuine laughter, food and wine everywhere, warm bar atmosphere, no one looking at the camera, pure authentic joy, documentary photography of friendship and laughter'],
  ['text', 'A photo of someone standing alone on a clifftop watching a dramatic sunset, back to camera, standing in the vast landscape, contemplative solitary moment, epic nature backdrop, introspective travel photography, person and landscape relationship'],
];

console.log(`准备入队 ${prompts.length} 条各类提示词...\n`);

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