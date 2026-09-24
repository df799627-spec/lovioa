#!/usr/bin/env node
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const missed = [
  'A luxury perfume bottle on a mirror surface, the bottle is faceted crystal with amber liquid visible inside, the reflection creates an infinite tunnel effect, soft studio lighting from above, luxury fragrance product photography, elegant and aspirational, minimalist luxury',
  'A sneaker floating in a void space, dramatic three-quarter angle, extreme detail on the shoe texture, bold colorways, the shoe is surrounded by a faint glow, studio product photography for a footwear brand, clean and impactful product shot',
  'An open cosmetics bag on a marble surface, every product visible: lipsticks in various shades, mascara, eyeshadow palettes, perfume, a mirror inside the lid reflecting the products, luxury beauty flat lay, warm natural light, aspirational beauty photography',
  'A mechanical watch macro shot, showing the movement through the transparent caseback, every gear and spring visible and in perfect mechanical order, studio macro watch photography, dramatic lighting to show movement detail, luxury horology',
  'A dramatic food photograph of a giant beef burger on a red checkered paper background, over-the-top toppings: bacon, cheese, lettuce, tomato, pickles, onion rings, the burger is enormous and imperfectly perfect, American diner food photography, bold and indulgent',
  'A sleek gaming laptop on a desk with RGB lighting, the screen displaying an intense action game scene, RGB keyboard and mouse glowing, cables organized with care, moody dark room with neon lighting, gaming setup product photography, aspirational tech gamer aesthetic',
  'A bicycle leaning against an old brick wall in an alley, the bicycle is vintage and beautifully maintained, a cafe with warm light visible through the window behind, evening urban atmosphere, lifestyle bicycle photography, European city cycling culture',
  'An exploded view product diagram of a classic mechanical keyboard, every keycap, switch, PCB, and frame floating in a precise arrangement, technical product illustration style, clean white background, engineering product design visualization',
  'A 3D rendered scene of a futuristic cityscape at night, volumetric fog between buildings, neon signs, flying cars in the distance, rain on camera lens creating lens flares, Unreal Engine 5 quality cinematic render, Blade Runner inspired city at night, hyper-detailed cyberpunk city',
  'A Pixar-style 3D animated character portrait, a wise old owl wearing tiny round glasses, expressive eyes with depth and character, soft fur texture rendered in 3D, warm studio lighting on the character, Pixar quality character animation still, heartwarming CGI character portrait',
  'A hyper-realistic 3D render of a Japanese koi pond, water so clear you can see every scale on every fish, lily pads, bamboo spout, reflections perfect, a dragonfly hovering above the water surface, photorealistic 3D pond render, peaceful zen koi pond',
];

const insert = db.prepare(`
  INSERT INTO gen_jobs
    (id, user_id, mode, model, size, quality, prompt, negative_prompt, reference_image_url, status, attempt_count, max_attempts, queued_at, created_at, updated_at)
  VALUES (?, NULL, 'text', 'gpt-image-2', '1024x1024', 'medium', ?, '', NULL, 'queued', 0, 5, ?, ?, ?)
`);

const now = new Date().toISOString();
let added = 0;
for (const p of missed) {
  const id = randomUUID();
  try {
    insert.run(id, p, now, now, now);
    added++;
    console.log('  + OK');
  } catch(e) {
    console.log('  x', e.message.slice(0, 50));
  }
}

console.log('\n补入:', added, '条');

const q = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs GROUP BY status ORDER BY status").all();
q.forEach(r => console.log('  ' + r.status + ': ' + r.c));
db.close();