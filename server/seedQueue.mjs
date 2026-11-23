/**
 * Seed script: inject 500 diverse AI photography prompts into the generation queue.
 * Run: node server/seedQueue.mjs
 *
 * The worker will pick these up and call the image generation API.
 * Categories covered: Portrait, Editorial, Landscape, Abstract, Fashion
 * Each prompt is intentionally different — variety in subject, lighting, mood, style.
 */

const BASE = 'http://localhost:3001';

const MODEL = 'gpt-image-2';
const SIZE  = '1024x1024';
const QUALITY = 'medium';

const CATEGORIES = ['Portrait', 'Editorial', 'Landscape', 'Abstract', 'Fashion'];

// ── Prompt templates ──────────────────────────────────────────────────────────

const PORTRAIT_PROMPTS = [
  // Lighting variations
  'Cinematic portrait of a young woman in golden hour light, shot on 85mm f/1.4 with shallow depth of field, warm skin tones, film grain, shot by Peter Lindbergh',
  'Moody portrait of a woman in blue hour, soft window light, mint tones, shot on Leica M10, 50mm Summilux, editorial style',
  'High-key beauty portrait, ethereal glow, soft rim lighting, pale pastel palette, shot on Hasselblad X2D, dreamy atmosphere',
  'Low-key portrait in deep shade, dramatic single-source light from the left, high contrast black and white, shot on Canon R5 with 135mm f/1.8',
  'Portrait with warm afternoon sunlight streaming through curtains, honey-toned skin, bokeh background, shot on Sony A7R IV, 85mm GM',
  'Rembrandt-lit portrait of a man with a short beard, dramatic triangle of light on cheek, deep shadows, shot on Nikon Z9',
  'Portrait in a rain-soaked city at night, neon reflections on wet pavement, cold color palette, cinematic bokeh, shot on Fujifilm X-T5',
  'Natural light portrait outdoors on an overcast day, soft even lighting, freckled skin, relaxed candid expression, shot on Canon R6',

  // Gender + age variations
  'Youthful portrait of a teenage girl in school uniform, cherry blossom background, Japanese aesthetic, shot on Ricoh GR III',
  'Mature portrait of a woman in her 50s, silver hair, confident gaze, studio lighting with soft box, shot on Phase One IQ4',
  'Portrait of an elderly man with weathered face, documentary style, natural window light, shot on Leica Q2',
  'Portrait of a child in a sunflower field, golden hour, pure joy expression, shot on Canon 5D Mark IV, 35mm f/1.4',

  // Clothing / attire
  'Fashion portrait of a woman wearing a black velvet gown, diamond necklace, jeweler-lit from below, shot on Canon R5',
  'Portrait of a woman in oversized white linen shirt, beach background, effortless chic, shot on Sony A7C with 55mm f/1.8',
  'Portrait of a man in a tailored charcoal suit, power pose, dark studio background, shot on Nikon Z7 II with 85mm f/1.4',
  'Portrait in traditional hanfu, Chinese ink painting aesthetic, bamboo grove background, shot on Fujifilm GFX 100',

  // Locations / environments
  'Portrait of a woman standing in an ancient library, tall bookshelves, warm candlelight, intellectual atmosphere, shot on Sony A7R V',
  'Portrait of a woman in a foggy forest at dawn, light rays through trees, ethereal mist, shot on Canon R5 with 35mm f/1.4',
  'Portrait of a man on a rooftop at sunset, city skyline background, cinematic, shot on Nikon Z8 with 50mm f/1.2',
  'Portrait of a woman in a minimalist white room, single plant in the corner, clean composition, shot on Leica M11',
  'Portrait of a woman in a traditional Parisian café, warm ambient light, soft bokeh of background patrons, shot on Fujifilm X-Pro3',

  // Artistic / conceptual
  "Double exposure portrait effect, woman\u2019s face merged with forest landscape, surreal art photography, shot on Canon 5D",
  "Portrait with lens flare from a golden disco ball, retro 70s atmosphere, warm tones, film emulation, shot on Pentax K-1",
  "Portrait with light painting trails around the subject, long exposure in darkness, neon colors, shot on Sony A7S III",
  "Split-lighting portrait, one side in shadow, one side lit, graphic and bold, shot on Leica SL2",
];

const EDITORIAL_PROMPTS = [
  // Magazine covers
  'Vogue-style fashion editorial cover, woman in a couture red dress, dramatic hair and makeup, studio lighting with colored gels, shot by Steven Meisel',
  'High fashion cover, model in avant-garde architectural garments, geometric shadows, shot on Hasselblad H6D, editorial magazine spread',
  'Harper\'s Bazaar cover, woman in pearl earrings, classic Hollywood glamour, soft black and white, shot on Phase One IQ3',
  'Elle editorial cover, model in streetwear, urban backdrop, natural light, shot on Leica SL with 35mm Summicron',

  // Seasonal
  'Spring fashion editorial, woman in floral maxi dress, botanical garden, soft pastel tones, shot on Fujifilm X-T4',
  'Summer swimwear editorial, model by a turquoise Mediterranean sea, golden hour, warm saturated colors, shot on Canon R6',
  'Autumn/winter fashion editorial, woman in oversized coat and scarf, fallen leaves, muted earth tones, shot on Sony A7R IV',
  'Snow-covered winter fashion editorial, model in fur-lined coat, snowy pine forest, cool blue and white palette, shot on Nikon Z9',

  // Beauty / close-up
  'Beauty close-up, extreme detail of skin and makeup, editorial macro shot, soft diffused light, shot on Phase One IQ4 150MP',
  'Beauty editorial, bold graphic eye makeup, high contrast, studio ring light, shot on Canon R5 with 100mm macro',
  'Hair editorial, dramatic updo with natural light streaming through window, artistic and sculptural, shot on Sony A7R V',

  // Lifestyle editorial
  'Lifestyle editorial, woman reading a book in a sunlit apartment, warm morning light, home aesthetic, shot on Fujifilm X100V',
  'Travel editorial, woman in a linen dress walking through a Tuscan village, golden afternoon light, shot on Leica Q3',
  'Food and fashion editorial, model with elaborate dessert spread, colorful and playful, shot on Canon 5D Mark IV',
  'Artistic nude editorial in black and white, dramatic chiaroscuro lighting, fine art aesthetic, shot on Leica M10 Monochrom',
];

const LANDSCAPE_PROMPTS = [
  // Golden / blue hour
  'Panoramic golden hour landscape of Icelandic volcanic plains, orange sky, moss-covered lava rocks, epic scale, shot on Sony A7R IV with 16mm',
  'Blue hour cityscape of Shanghai at dusk, Pudong skyline reflected in Huangpu River, cool blue and warm amber, shot on Nikon Z7 II',
  'Golden hour landscape of Tuscany rolling hills, cypress trees, olive groves, warm amber light, shot on Canon 5D Mark IV',
  'Blue hour mountain lake at 4000m altitude, snow-capped peaks reflected perfectly in still water, cold blue tones, shot on Sony A7S III',

  // Weather
  'Dramatic storm approaching over the Great Plains, supercell thunderhead, ominous dark clouds, epic scale photography, shot on Nikon D850',
  'Morning fog rolling through a mountain valley, morning sun breaking through, layered mist, shot on Fujifilm GFX 100S',
  'Heavy snowfall over a medieval European village, warm light from windows contrasting cold white, cozy and cold tension, shot on Canon R5',
  'Desert landscape under a clear night sky, Milky Way arching overhead, rock formations silhouette, shot on Sony A7S III with 14mm f/1.8',

  // Seascapes
  'Long exposure seascape of the Norwegian coast, dramatic cliffs, silky smooth water, overcast sky, shot on Phase One IQ4',
  'Sunrise over the Pacific Ocean from a cliff edge, long lens compression, golden mist, shot on Canon 5D Mark IV',
  'Tidal pool at low tide, seaweed and coral detail, crystal clear water, overhead sun, macro landscape shot on Sony A7R V',
  'Aerial view of Maldives atoll, aerial orthographic perspective, turquoise lagoons, coral patterns, shot on DJI Mavic 3',

  // Forests / nature
  'Ancient Japanese cedar forest in Yakushima, mystical fog, moss-covered trees, ethereal green light rays, shot on Fujifilm X-T5',
  'Autumn maple forest in Kyoto, tunnel of red trees, stone lantern, atmospheric fog, shot on Sony A7R IV',
  'Boreal taiga forest in Finnish Lapland, snow-covered pines, polar night deep blue sky, shot on Nikon Z9',
  'Patagonian steppe with Fitz Roy mountain in background, golden pampas grass, wind-swept, epic scale, shot on Canon R5',

  // Urban landscapes
  'Brutalist architecture at dawn, geometric concrete forms, long shadows, moody monochromatic, shot on Leica SL2',
  'Night rain in Tokyo Shibuya, neon reflections on wet asphalt, pedestrian silhouettes, cinematic, shot on Sony A7S III',
  'Birds-eye view of a traditional Moroccan medina, intricate street patterns, warm earth tones, shot on DJI Mavic 3',
  'Aerial view of Amsterdam canal ring at blue hour, warm window lights reflecting in water, shot on Fujifilm GFX 100S',
];

const ABSTRACT_PROMPTS = [
  // Textures / patterns
  'Extreme macro of soap bubble surface, iridescent interference colors, rainbow refraction patterns, shot on Canon R5 with MP-E 65mm',
  'Abstract close-up of melted ice on glass, refracted light creating geometric patterns, cool blue tones, shot on Sony A7R V',
  'Macro of dewdrops on spider web at dawn, each drop containing a tiny landscape, backlit, shot on Nikon Z9 with macro',
  'Abstract ink drop in water, high-speed capture, frozen motion, dramatic splashes, shot on Canon 1DX Mark III',

  // Light art
  'Light painting in complete darkness, figure-eight motion trails, neon cyan and magenta, shot on Sony A7S III',
  'Prism and rainbow light experiment, white light split into spectrum, artistic geometric patterns, shot on Phase One',
  'Abstract light installation in an abandoned warehouse, volumetric fog and colored lasers, moody atmosphere, shot on Canon R6',
  'Light leaks on expired 35mm film, organic orange and purple streaks, nostalgic analog aesthetic, shot on Pentax K-1',

  // Motion / fluid
  'High-speed capture of a milk drop crown splash, frozen in mid-air, organic sculptural form, shot on Canon 1DX Mark III',
  'Long exposure of a silk cloth in motion underwater, flowing organic shapes, soft pastel colors, shot on Sony A7C',
  'Abstract smoke photography, colored smoke against black background, billowing organic forms, shot on Nikon Z8',
  'Abstract honey pour in macro, golden viscous liquid in mid-air spiral, warm tones, shot on Canon R5 with macro',

  // Architecture as abstract
  'Looking up at a glass skyscraper, geometric grid pattern, sky reflections, minimal abstract composition, shot on Fujifilm X-T5',
  'Abstract of a spiral staircase from below, concentric geometric forms, dramatic chiaroscuro, shot on Leica Q3',
  'Abstract reflection of buildings in a puddle, fragmented and distorted, painterly quality, shot on iPhone 15 Pro Max',
  'Islamic geometric tile patterns, extreme detail, symmetry and repetition, warm amber and blue, shot on Phase One IQ4',

  // Digital / glitch aesthetic
  'Abstract digital glitch art, data moshing effect, corrupted pixel fragments, neon on black, generative art style',
  'Extreme bokeh abstraction, city lights as colorful circles of blur, painterly and dreamlike, shot on Sony A7S III',
  'Double exposure: cityscape merged with forest, surreal and dreamlike, high saturation, shot on film',
  'Infrared photography of a park, grass and leaves rendered white, surreal monochromatic world, shot on modified Canon',
];

const FASHION_PROMPTS = [
  // Runway / avant-garde
  'Issey Miyake runway show, pleated fabric in motion, dynamic folding patterns, dramatic stage lighting, editorial fashion',
  'Alexander McQueen couture show, theatrical dark aesthetic, sculptural garments, spotlight drama, fashion editorial',
  'Vetements oversized streetwear, deconstructed proportions, urban gritty backdrop, street style high fashion',
  'Comme des Garçons conceptual fashion, sculptural formless garments, performance art meets fashion, avant-garde editorial',

  // Casual / everyday luxury
  'Minimalist fashion, model in cream cashmere sweater and tailored trousers, clean Parisian style, natural window light',
  'Street style fashion, model in vintage denim and leather jacket, NYC SoHo backdrop, effortless cool, shot on Leica Q2',
  'Athleisure fashion editorial, designer sporty garments, gym aesthetic, dynamic and energetic, shot on Canon R6',
  'Sustainable fashion editorial, organic cotton and linen garments, natural texture, earthy warm tones, shot on Fujifilm X-T4',

  // Beauty products
  'Beauty campaign for a luxury skincare brand, flawless skin close-up, soft light, premium product display, shot on Phase One IQ4',
  'Fragrance campaign, model in a flowing gown in a lavender field, dreamy and romantic, warm golden light, shot on Canon 5D',
  'Makeup campaign, bold graphic lip color, studio lighting, high contrast, editorial beauty, shot on Sony A7R V',
  'Hair care campaign, glossy healthy hair in motion, natural wind, sun-kissed, beach aesthetic, shot on Nikon Z9',

  // Accessories / detail
  'Fashion accessory detail, luxury leather handbag in natural light, texture close-up, premium material aesthetic, shot on Phase One',
  'Shoe editorial, sculptural designer heels, minimalist white backdrop, dramatic shadows, shot on Canon R5',
  'Jewelry editorial, gold and diamond ring macro, studio soft box, luxury and elegance, shot on Sony A7R V',
  'Watch campaign, luxury timepiece on wrist, natural lifestyle setting, warm ambient light, shot on Leica SL2',

  // Cultural fusion
  'African wax print fashion, bold colorful patterns, contemporary silhouette, warm African light, shot on Fujifilm X-T5',
  'Japanese street fashion, Harajuku layered style, colorful and playful, Tokyo urban backdrop, shot on Ricoh GR III',
  'Traditional meets modern, model in redesigned hanbok, Seoul city backdrop, cultural fashion editorial, shot on Sony A7R IV',
  'Indian couture fashion, intricately embroidered sari, gold jewelry, dramatic bridal look, warm ambient light, shot on Canon R5',
];

// ── Build full prompt list ─────────────────────────────────────────────────────
const allPrompts = [
  ...PORTRAIT_PROMPTS.map(p => ({ category: 'Portrait', prompt: p })),
  ...EDITORIAL_PROMPTS.map(p => ({ category: 'Editorial', prompt: p })),
  ...LANDSCAPE_PROMPTS.map(p => ({ category: 'Landscape', prompt: p })),
  ...ABSTRACT_PROMPTS.map(p => ({ category: 'Abstract', prompt: p })),
  ...FASHION_PROMPTS.map(p => ({ category: 'Fashion', prompt: p })),
];

// ── Shuffle + repeat to reach 500 ─────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let pool = shuffle(allPrompts);
while (pool.length < 500) pool = pool.concat(shuffle(allPrompts));
pool = pool.slice(0, 500);

// ── Batch send to server ──────────────────────────────────────────────────────
async function enqueueJob(prompt, category, model = MODEL, size = SIZE, quality = QUALITY) {
  const res = await fetch(`${BASE}/api/gen/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model, size, quality, category }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  console.log(`Sending ${pool.length} jobs to ${BASE}...`);
  console.log('Breakdown: Portrait, Editorial, Landscape, Abstract, Fashion each ~100 jobs\n');

  let sent = 0;
  let failed = 0;

  for (const { prompt, category } of pool) {
    try {
      await enqueueJob(prompt, category);
      sent++;
      if (sent % 50 === 0) {
        process.stdout.write(`  ✓ ${sent}/${pool.length} sent\n`);
      }
    } catch (err) {
      failed++;
      console.error(`  ✗ Failed to enqueue: ${err.message}`);
    }
    // Small delay to avoid hammering the server's HTTP layer
    if (sent % 20 === 0) await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}, Total: ${sent + failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
