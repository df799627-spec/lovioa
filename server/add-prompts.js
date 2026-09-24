#!/usr/bin/env node
/**
 * Add new prompts to the prompts table.
 * Run: node add-prompts.js
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, 'data/lovioa.db');
const db = new Database(DB_FILE);

const newPrompts = [
  // Portrait — 人像精修
  ['Portrait', 'Fashion photography, an Asian female model in a flowing silk dress against a misty mountain backdrop, golden hour lighting, editorial elegance, shot on Hasselblad 907X, f/2.8 soft focus background'],
  ['Portrait', 'Street portrait, a weathered elderly man with deep wrinkles reading a newspaper in a neon-lit alleyway, Tokyo at night, cinematic bokeh, Leica Q3, 28mm'],
  ['Portrait', 'Beauty campaign, a South Asian woman with traditional henna patterns on her hands, soft diffused natural window light, cream and terracotta tones, editorial close-up'],
  ['Portrait', 'Sports photography, a female tennis player in mid-serve motion, sweat and intensity in her expression, caught mid-air with a blurred crowd background, Canon R5, 1/2000s shutter'],
  ['Portrait', 'Underwater portrait, a free diver descending through a sunbeam in crystal blue water, teal and cyan color palette, ethereal mood, full underwater housing shot'],
  ['Portrait', 'Traditional Japanese bathhouse portrait, steam rising around a woman with wet hair, soft warm ambient light filtering through wooden screens, peaceful expression, serene atmosphere'],

  // Landscape — 风景画意
  ['Landscape', 'Aerial drone shot of terraced rice fields in Yunnan Province at sunrise, morning mist filling the valleys, golden light hitting each terrace, HDR color grading, 8K resolution'],
  ['Landscape', 'Minimalist landscape photography, a single baobab tree on an endless flat salt flat in Madagascar, perfect symmetry, clear sky reflected on wet ground, long exposure'],
  ['Landscape', 'Storm photography, a violent supercell thunderstorm over the Great Plains of Kansas, dramatic shelf cloud, lightning striking in the distance, dramatic chiaroscuro lighting'],
  ['Landscape', 'Forest photography, morning light streaming through ancient beech forest in the Black Forest Germany, god rays through mist, ferns and moss, long exposure soft water effect'],
  ['Landscape', 'Desert landscape, sand dunes at Namibia Sossusvlei during blue hour, deep shadows and warm highlights, star trails above, Milky Way visible, panoramic composition'],

  // Editorial — 时尚大片
  ['Editorial', 'High fashion editorial, a model wearing architectural white latex and chrome outfit standing in an industrial concrete stairwell, noir lighting, Helmut Newton inspired, 85mm compression'],
  ['Editorial', 'Vogue Italia style editorial, a model in vintage Dior couture walking through the ruins of a Roman amphitheater, dramatic fashion against ancient architecture, golden hour'],
  ['Editorial', 'Street style photography, a fashion blogger in layered cream knitwear and vintage Levis walking through the streets of Paris in autumn, candid moment, natural light, Leica M11'],

  // Fashion — 时尚单品
  ['Fashion', 'Product photography, a luxury leather handbag resting on a marble surface, soft studio lighting from above, rose gold and tan leather tones, editorial clean background, 8x10 view camera'],
  ['Fashion', 'Catalog photography, a male model in a navy wool overcoat and cashmere scarf standing on a cobblestone street, London autumn, moody overcast light, cinematic color grading'],
  ['Fashion', 'Beauty product flat lay, premium skincare collection arranged on a sage green linen surface with dried flowers, morning light from left window, minimal Scandinavian aesthetic'],

  // Abstract — 创意抽象
  ['Abstract', 'Abstract macro photography, extreme close-up of cracked dry earth in the Badlands of South Dakota, textures and layered earth tones, geological patterns, 1:1 macro ratio'],
  ['Abstract', 'Long exposure abstract photography, a spinning mirror ball reflecting city lights in motion, neon trails and bokeh circles, 30-second exposure, dark cityscape background'],
  ['Abstract', 'Abstract fine art, ink drop diffusion in water photographed from above, black ink slowly expanding in clear water, minimal dark background, high speed flash synchronized'],
  ['Abstract', 'Abstract architecture photography, interior of the Heydar Aliyev Center in Baku Azerbaijan, flowing white curves and negative space, wide-angle upward perspective, clean minimalist composition'],

  // Street — 街头纪实
  ['Street', 'Street photography, a child running through puddles in a flooded alley in Mumbai during monsoon season, rain reflections, human joy captured in motion, Leica M10-R monochrom'],
  ['Street', 'Urban photography, a crowded night market in Bangkok Chinatown, lanterns and neon signs reflected on wet pavement, bustling atmosphere, wide-angle lens, documentary style'],
  ['Street', 'Street portrait, a jazz musician playing trumpet on a New Orleans street corner, late evening warm street light, brass instrument glowing, authentic cultural moment, film grain aesthetic'],
];

console.log('准备添加', newPrompts.length, '条提示词...\n');

const insert = db.prepare(`
  INSERT INTO prompts
    (id, image_url, prompt, author_name, author_avatar, author_user_id, tags_json, category, likes, liked, saved, created_at)
  VALUES (?, '', ?, 'system', '', NULL, '[]', ?, 0, 0, 0, ?)
`);

const now = new Date().toISOString();
let added = 0;
let failed = 0;

for (const [cat, promptText] of newPrompts) {
  const id = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${added}`;
  try {
    insert.run(id, promptText, cat, now);
    added++;
    console.log(`  + [${cat}] ${promptText.slice(0, 55)}...`);
  } catch (e) {
    failed++;
    console.log(`  x 失败 [${cat}]: ${e.message}`);
  }
}

console.log(`\n成功添加: ${added} 条  |  失败: ${failed} 条\n`);

const counts = db.prepare('SELECT category, COUNT(*) as c FROM prompts GROUP BY category ORDER BY c DESC').all();
console.log('=== 分类分布 ===');
counts.forEach(r => console.log(`  ${r.category}: ${r.c}`));

const total = db.prepare('SELECT COUNT(*) as c FROM prompts').get();
console.log(`  总计: ${total.c}`);

db.close();