import { randomUUID as cryptoRandomUUID } from 'crypto';
import { db } from './promptsRepo.js';
const crypto = { randomUUID: cryptoRandomUUID };

function nowIso() { return new Date().toISOString(); }

export function ensureSkillTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      tags_json TEXT NOT NULL DEFAULT '[]',
      author_user_id TEXT,
      author_name TEXT NOT NULL DEFAULT '',
      author_avatar TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public',
      status TEXT NOT NULL DEFAULT 'published',
      ai_generated INTEGER NOT NULL DEFAULT 0,
      install_count INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      liked INTEGER NOT NULL DEFAULT 0,
      version TEXT NOT NULL DEFAULT '1.0.0',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_skills_author ON skills(author_user_id);
    CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
    CREATE INDEX IF NOT EXISTS idx_skills_created ON skills(created_at);
  `);
}

function rowToSkill(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    category: row.category,
    tags: JSON.parse(row.tags_json || '[]'),
    author: {
      name: row.author_name || 'Anonymous',
      avatar: row.author_avatar || '',
      userId: row.author_user_id || null,
    },
    visibility: row.visibility,
    status: row.status,
    aiGenerated: !!row.ai_generated,
    installCount: row.install_count || 0,
    likes: row.likes || 0,
    liked: !!row.liked,
    version: row.version || '1.0.0',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function slugify(name) {
  const base = String(name || 'skill')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48) || 'skill';
  let slug = base;
  let n = 1;
  while (db.prepare('SELECT 1 FROM skills WHERE slug = ?').get(slug)) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

export function createSkill({ name, description = '', instructions = '', category = 'general', tags = [], author = null, visibility = 'public', status = 'published', aiGenerated = false, version = '1.0.0' }) {
  const now = nowIso();
  const row = {
    id: crypto.randomUUID(),
    slug: slugify(name),
    name,
    description,
    instructions,
    category,
    tags_json: JSON.stringify(Array.isArray(tags) ? tags.slice(0, 12) : []),
    author_user_id: author?.userId || null,
    author_name: author?.name || 'Anonymous',
    author_avatar: author?.avatar || '',
    visibility,
    status,
    ai_generated: aiGenerated ? 1 : 0,
    install_count: 0,
    likes: 0,
    liked: 0,
    version,
    created_at: now,
    updated_at: now,
  };
  db.prepare(`
    INSERT INTO skills (id, slug, name, description, instructions, category, tags_json,
      author_user_id, author_name, author_avatar, visibility, status, ai_generated,
      install_count, likes, liked, version, created_at, updated_at)
    VALUES (@id, @slug, @name, @description, @instructions, @category, @tags_json,
      @author_user_id, @author_name, @author_avatar, @visibility, @status, @ai_generated,
      @install_count, @likes, @liked, @version, @created_at, @updated_at)
  `).run(row);
  return rowToSkill(db.prepare('SELECT * FROM skills WHERE id = ?').get(row.id));
}

export function getSkillById(id) {
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
  return row ? rowToSkill(row) : null;
}

export function getSkillBySlug(slug) {
  const row = db.prepare('SELECT * FROM skills WHERE slug = ?').get(slug);
  return row ? rowToSkill(row) : null;
}

export function listSkills({ search = '', category = '', authorUserId = '', limit = 60, offset = 0, includeUnpublished = false } = {}) {
  const where = [];
  const params = {};
  if (!includeUnpublished) {
    where.push(`status = 'published' AND visibility = 'public'`);
  }
  if (category) {
    where.push('category = @category');
    params.category = category;
  }
  if (authorUserId) {
    where.push('author_user_id = @authorUserId');
    params.authorUserId = authorUserId;
  }
  if (search) {
    where.push('(name LIKE @search OR description LIKE @search OR tags_json LIKE @search OR instructions LIKE @search)');
    params.search = `%${search}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(1) AS c FROM skills ${whereSql}`).get(params).c;
  const rows = db.prepare(`
    SELECT * FROM skills ${whereSql}
    ORDER BY likes DESC, install_count DESC, created_at DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset });
  return { total, skills: rows.map(rowToSkill) };
}

export function listSkillCategories() {
  const rows = db.prepare(`
    SELECT category, COUNT(1) AS c FROM skills
    WHERE status = 'published' AND visibility = 'public'
    GROUP BY category ORDER BY c DESC
  `).all();
  return rows;
}

export function updateSkill(id, updates) {
  const existing = db.prepare('SELECT * FROM skills WHERE id = ?').get(id);
  if (!existing) return null;
  const sets = [];
  const params = { id, updated_at: nowIso() };
  const map = {
    name: 'name', description: 'description', instructions: 'instructions',
    category: 'category', visibility: 'visibility', status: 'status', version: 'version',
  };
  for (const [key, col] of Object.entries(map)) {
    if (updates[key] !== undefined) {
      sets.push(`${col} = @${key}`);
      params[key] = updates[key];
    }
  }
  if (updates.tags !== undefined) {
    sets.push('tags_json = @tags_json');
    params.tags_json = JSON.stringify(Array.isArray(updates.tags) ? updates.tags.slice(0, 12) : []);
  }
  if (sets.length === 0) return rowToSkill(existing);
  db.prepare(`UPDATE skills SET ${sets.join(', ')}, updated_at = @updated_at WHERE id = @id`).run(params);
  return rowToSkill(db.prepare('SELECT * FROM skills WHERE id = ?').get(id));
}

export function deleteSkill(id) {
  const res = db.prepare('DELETE FROM skills WHERE id = ?').run(id);
  return res.changes > 0;
}

export function toggleSkillLike(id) {
  const row = db.prepare('SELECT liked, likes FROM skills WHERE id = ?').get(id);
  if (!row) return null;
  const liked = row.liked ? 0 : 1;
  const likes = Math.max(0, (row.likes || 0) + (liked ? 1 : -1));
  db.prepare('UPDATE skills SET liked = ?, likes = ? WHERE id = ?').run(liked, likes, id);
  return { liked: !!liked, likes };
}

export function incrementSkillInstall(id) {
  db.prepare('UPDATE skills SET install_count = install_count + 1 WHERE id = ?').run(id);
  const row = db.prepare('SELECT install_count FROM skills WHERE id = ?').get(id);
  return row ? row.install_count : null;
}

export function getSkillStats() {
  const total = db.prepare("SELECT COUNT(1) AS c FROM skills WHERE status = 'published'").get().c;
  const installs = db.prepare('SELECT COALESCE(SUM(install_count), 0) AS c FROM skills').get().c;
  const authors = db.prepare("SELECT COUNT(DISTINCT author_user_id) AS c FROM skills WHERE author_user_id IS NOT NULL AND status = 'published'").get().c;
  return { skillsShared: total, installs, authors };
}

export function adminListSkills({ search = '', limit = 100, offset = 0 } = {}) {
  const where = [];
  const params = {};
  if (search) {
    where.push('(name LIKE @search OR description LIKE @search OR author_name LIKE @search)');
    params.search = `%${search}%`;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(1) AS c FROM skills ${whereSql}`).get(params).c;
  const rows = db.prepare(`SELECT * FROM skills ${whereSql} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit, offset });
  return { total, skills: rows.map(rowToSkill) };
}
