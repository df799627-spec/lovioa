import Database from 'better-sqlite3';
const db = new Database('./data/lovioa.db');

// Add new columns if they don't exist (same as ensureColumn in promptsRepo.js migrate())
function ensureCol(table, col, def) {
  const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name));
  if (!cols.has(col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
    console.log('Added column:', table, col);
  }
}
ensureCol('gen_history', 'category', "category TEXT NOT NULL DEFAULT 'Abstract'");
ensureCol('gen_history', 'moderation_status', "moderation_status TEXT NOT NULL DEFAULT 'pending'");

const sample = db.prepare('SELECT id, moderation_status, category FROM gen_history LIMIT 3').all();
console.log('Samples:', sample.map(r => ({ id: r.id.slice(0,8), mod: r.moderation_status, cat: r.category })));

const pending = db.prepare("SELECT COUNT(*) as c FROM gen_history WHERE moderation_status = 'pending'").get().c;
const total = db.prepare('SELECT COUNT(*) as c FROM gen_history').get().c;
console.log('Total:', total, '| pending:', pending);

if (total > 0 && pending === 0) {
  db.prepare("UPDATE gen_history SET moderation_status = 'pending' WHERE moderation_status IS NULL OR moderation_status = ''").run();
  console.log('Updated all existing rows to pending.');
}

// Infer category for existing rows that don't have one
const noCat = db.prepare("SELECT COUNT(*) as c FROM gen_history WHERE category IS NULL OR category = ''").get().c;
console.log('Rows without category:', noCat);
db.close();
