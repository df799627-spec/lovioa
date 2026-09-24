import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
const db = new Database('./data/lovioa.db');
const now = new Date().toISOString();

const prompts = [
  // Portrait (12)
  `Cinematic portrait of an elderly East Asian woman with deep wrinkles, silver hair in a bun, warm amber window light on her face, shallow depth of field, Leica M11.`,
  `High-contrast black and white portrait of a young Black man with short fade haircut, single Rembrandt light from the right, intense direct gaze, film grain, Hasselblad 503cx.`,
  `Moody portrait of a teenage girl sitting by an open window on a rainy afternoon, cold blue tones, contemplative expression, 85mm f/1.4 bokeh, Sony A7R V.`,
  `Luxury beauty portrait of a South Asian woman with detailed henna patterns on her hands, golden hour side lighting, dewy skin, high-key editorial, Vogue India.`,
  `Environmental portrait of a craftsman in a Tokyo workshop surrounded by wooden tools, dust particles in light beams, documentary style, natural light through paper screens.`,
  `Split-lighting portrait of a Middle Eastern man wearing a traditional thawb, one side lit by warm candlelight, the other in deep shadow, dramatic chiaroscuro.`,
  `Soft portrait of a sleeping infant on white linen sheets, morning light streaming through sheer curtains, pastel tones, newborn photography style, Canon RF 85mm.`,
  `Portrait of a dancer mid-movement in a sunlit studio, sweat on skin, hair frozen in motion, golden backlight creating halo, action portraiture.`,
  `Close-up portrait of a weathered Indigenous elder, deep skin texture, piercing eyes looking directly at camera, natural daylight, National Geographic style.`,
  `Surreal portrait of a woman with butterfly wings replacing her dress, orchid garden setting, golden hour, fantasy editorial, Vogue Arabia.`,
  `Portrait series of three generations of women standing together in a lavender field, matching dresses, soft evening light, generational storytelling.`,
  `Noir-style portrait of a detective in a 1940s raincoat, neon sign reflection in wet pavement, film noir aesthetic, cigarette smoke, shallow depth of field.`,

  // Editorial (10)
  `Dior Beauty campaign, model with glass-skin makeup sitting in a Versailles gilded chair, chandelier above, haute couture, ultra high definition.`,
  `Elle Magazine travel issue cover, woman in a flowing white maxi dress on a Maldives sandbank at low tide, turquoise water, aerial drone perspective.`,
  `Harper Bazaar beauty editorial, extreme macro of an eye with aurora borealis makeup pigments, each lash perfectly separated, studio ring light.`,
  `Porter Magazine capsule wardrobe editorial, minimalist wardrobe of camel grey and black pieces, natural linen textures, flat-lay and worn.`,
  `AnOther Magazine avant-garde fashion story, model wearing architectural Rei Kawakubo gown in an abandoned brutalist concrete hall.`,
  `Vanity Fair Hollywood issue digital cover, actress in emerald velvet gown against a velvet backdrop, Old Hollywood glamour, 8x10 view camera.`,
  `Kinfolk lifestyle editorial, slow morning scene with croissant espresso and linen napkins, sun-dappled marble kitchen, Danish morning light.`,
  `British Vogue sustainability issue, model wearing upcycled vintage Dior patchwork jacket, concrete urban rooftop garden backdrop, natural makeup.`,
  `i-D Magazine street style spread, candid fashion week attendees outside Pitti Uomo, diverse styles, film photography aesthetic, warm tones.`,
  `Numero Magazine art fashion story, model floating in zero gravity inside a vintage 1950s plane fuselage, surreal fashion, experimental lighting.`,

  // Fashion / Product (8)
  `Extreme macro photography of a Patek Philippe wristwatch movement, every gear and jewel visible, dramatic product lighting, shallow depth of field.`,
  `Vogue Accessories editorial, vintage Hermès silk scarves tied around a wicker beach bag handle, Mediterranean blue background, luxury still life.`,
  `Fashion detail shot of hand-stitched Italian leather Oxford shoes, needle and thread visible, workshop bench, warm tungsten light, storytelling product.`,
  `High-end jewelry campaign, Art Deco sapphire and diamond brooch on black velvet, dramatic spot light from above, museum-quality product photography.`,
  `Bottega Veneta campaign, intrecciato leather tote bag suspended in a Roman travertine fountain, water splashes frozen mid-air.`,
  `Fashion e-commerce flat-lay, complete autumn capsule wardrobe on bleached oak floor, coat knit trousers scarf boots, natural top-down light.`,
  `Beauty product photography, row of Chanel bottles on limestone bathroom shelf, jasmine flowers beside them, steam rising, soft window light.`,
  `Luxury handbag campaign, Hermès Birkin in Gold Togo leather on a Parisian cafe table, croissant and coffee in background, street photography style.`,

  // Landscape (10)
  `Northern Lights aurora borealis over a frozen Norwegian fjord, reflections of green and purple lights on ice, stars visible, long exposure, no light pollution.`,
  `Aerial view of the Japanese Alps at first snowfall, mountain peaks white with fresh powder, evergreen forest below transitioning to autumn colors.`,
  `Misty morning in Zhangjiajie National Forest, sandstone pillars emerging from cloud sea, ancient ginkgo trees in foreground, ethereal Chinese landscape light.`,
  `Santorini caldera view at blue hour, white cubic buildings cascading down cliffside, church domes, cruise ship in harbor below, deep blue to orange sky.`,
  `Hyper-detailed macro of a dewdrop on a spider web at sunrise, miniature world inside the droplet, refracted flower behind, ultra-sharp focus stack.`,
  `Sahara Desert at golden hour, perfect symmetrical dunes with wind-carved ripple lines, camel caravan silhouette in distance, warm orange tones to horizon.`,
  `Cherry blossom tunnel in Kyoto at full bloom, train passing through slowly, petals suspended in air, Japanese rail photography, film emulation tones.`,
  `Olympic Peninsula rainforest in Washington state, giant Sitka spruce with hanging moss, elk tracks in mud, ferns foreground, emerald green palette.`,
  `Tromsø Norway polar night, aurora borealis in vivid green and magenta above a wooden rorbu cabin village, snow, frozen fjord reflections, Milky Way visible.`,
  `Icelandic volcanic black sand beach at sunset, basalt sea stacks offshore, crashing wave frozen mid-motion, rainbow mist, moody dramatic sky.`,

  // Street (5)
  `Shibuya Crossing at 2am after rain, empty intersections, neon reflections on wet asphalt, cyberpunk atmosphere, long exposure creating light trails.`,
  `Diwali festival in Mumbai, woman in a bright sari holding a clay diya lamp, darkness lit only by lamp glow and fairy lights, warm orange tones.`,
  `New York City street photography, jazz musician playing saxophone on a subway platform, commuters walking past without looking, film grain, decisive moment.`,
  `Marrakech Medina at dusk, spice market stalls lit by hanging bare bulbs, rich colors of saffron paprika cumin turmeric, warm tungsten and dusk mix.`,
  `Tokyo Shibuya alley at night, narrow pedestrian street with izakaya lanterns and ramen shop steam, people in silhouette, rain reflections, Japanese night.`,

  // Abstract (5)
  `Abstract macro of ferrofluid in a magnetic field, spike formations rising from black liquid, iridescent rainbow reflections on metallic surfaces.`,
  `Surrealist photograph, a grand piano sinking into sand on a beach, keys still playing, water rising around it, dramatic stormy sky, cinematic art direction.`,
  `Experimental long exposure of light painting in a dark warehouse, dancer movement traced in blue and gold LED light ribbons, abstract motion blur.`,
  `Abstract architecture photography, perfect symmetry of a Persian mosque interior, tiled walls, pointed arches, muqarnas ceiling, geometric perfection.`,
  `Double exposure fine art photograph, an eagle head merged with a stormy mountain landscape, black and white with selective color, powerful and dramatic.`,
];

// Deduplicate against existing queue and history
const existingJobs = new Set(db.prepare('SELECT prompt FROM gen_jobs').all().map(r => r.prompt.trim().toLowerCase()));
const existingHist = new Set(db.prepare('SELECT prompt FROM gen_history').all().map(r => r.prompt.trim().toLowerCase()));
const allExisting = new Set([...existingJobs, ...existingHist]);

const newPrompts = prompts.filter(p => !allExisting.has(p.trim().toLowerCase()));
console.log('Total prompts in batch:    ', prompts.length);
console.log('Already in queue/history:  ', prompts.length - newPrompts.length);
console.log('New unique to insert:      ', newPrompts.length);

if (newPrompts.length === 0) {
  console.log('All prompts already exist. Nothing to insert.');
  db.close();
  process.exit(0);
}

const insert = db.prepare(`
  INSERT INTO gen_jobs (id, user_id, mode, model, size, quality, prompt, negative_prompt, status, attempt_count, max_attempts, queued_at, next_retry_at, last_error, created_at, updated_at)
  VALUES (?, NULL, 'text', 'gpt-image-1', '1024x1024', 'high', ?, '', 'queued', 0, 3, ?, ?, '', ?, ?)
`);

let count = 0;
const tx = db.transaction(() => {
  for (const p of newPrompts) {
    insert.run(randomUUID(), p, now, now, now, now);
    count++;
  }
});
tx();

console.log('\nInserted', count, 'new prompts into queue');

// Show new queue status
const queued = db.prepare("SELECT COUNT(*) as c FROM gen_jobs WHERE status = 'queued'").get().c;
const total  = db.prepare('SELECT COUNT(*) as c FROM gen_jobs').get().c;
console.log('Queue status:');
console.log('  queued:    ', queued);
console.log('  succeeded:  ', db.prepare("SELECT COUNT(*) as c FROM gen_jobs WHERE status = 'succeeded'").get().c);
console.log('  failed:     ', db.prepare("SELECT COUNT(*) as c FROM gen_jobs WHERE status = 'failed'").get().c);
console.log('  total:      ', total);

db.close();
