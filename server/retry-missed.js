#!/usr/bin/env node
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const missed = [
  'A close-up portrait of an elderly woman with deep character lines, silver hair tied back, wearing a vibrant floral headscarf, warm golden window light on one side, the other side in deep shadow, photorealistic, documentary photography style, raw and honest beauty, rich warm tones',
  'A portrait of a street musician playing violin in a rainy city alley at night, neon reflections on wet pavement, a streetlamp casting dramatic orange light, blurred city lights in background, cinematic street photography, moody atmospheric portrait',
  'A portrait in renaissance oil painting style, a noble woman with intricate pearl jewelry, rich velvet dress in deep burgundy, dramatic chiaroscuro lighting, oil paint texture visible, restored masterwork quality, warm candlelight atmosphere',
  'A double exposure portrait, a woman face simultaneously showing an outer cityscape through the face silhouette, surreal photomontage art, dark background with golden city glow, artistic double exposure photography concept',
  'A portrait of a child with the most expressive eyes, looking directly at camera with complete joy, natural window light, freckled skin, messy hair, photojournalism style, raw genuine emotion, no studio lighting',
  'A cyberpunk character portrait, a person with half their face replaced by chrome cybernetic implant, neon blue light glowing from cybernetic eye, other side of face completely human and vulnerable, dramatic contrast, sci-fi portrait photography',
  'A large group portrait of fifteen people from different cultures laughing together, candid moment, outdoor golden hour light, diverse ages and backgrounds, warm documentary photography, genuine human connection',
  'A portrait of a blind elderly man with closed eyes, holding a vintage camera, warm smile lines, textured weathered skin, silver beard, natural light, empathetic portrait, timeless photography style',
  'An underwater portrait of a freediver looking up through the water surface, shafts of light from above, bubbles surrounding the face, blue-green water tones, ethereal and meditative atmosphere, surreal underwater photography',
  'A portrait in pure silhouette, a figure standing at the edge of a cliff at sunset, the face not visible at all — pure shape and posture telling the story, dramatic backlit silhouette, warm orange sky, emotional silhouette photography',
  'A flat lay of authentic Japanese breakfast on a wooden table: miso soup in a ceramic bowl, grilled salmon, tamago, pickled vegetables, rice in a lacquered bowl, chopsticks, a cup of green tea steaming, morning sunlight from window, styled food photography, Japanese cuisine aesthetic, warm natural light',
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
    console.log('  + OK:', p.slice(0, 50));
  } catch(e) {
    console.log('  x', e.message.slice(0, 60));
  }
}
console.log('\n补入:', added, '条');

const q = db.prepare("SELECT status, COUNT(*) as c FROM gen_jobs GROUP BY status ORDER BY status").all();
q.forEach(r => console.log('  ' + r.status + ': ' + r.c));
db.close();