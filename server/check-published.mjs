import Database from 'better-sqlite3';
const db = new Database('./data/lovioa.db');
const published = db.prepare(`SELECT id, image_url, prompt, category, extra_data FROM prompts ORDER BY created_at DESC LIMIT 5`).all();
console.log('Published prompts:', published.length);
for (const p of published) {
  console.log(`  id=${p.id.slice(0,8)} cat=${p.category}`);
  console.log(`  img=${p.image_url?.slice(0,70)}`);
  console.log(`  prompt=${p.prompt?.slice(0,60)}`);
  console.log();
}
const ei = db.prepare(`SELECT COUNT(*) as c, published_to_prompts FROM editor_items GROUP BY published_to_prompts`).all();
console.log('Editor items by published_to_prompts:', JSON.stringify(ei));
