import Database from 'better-sqlite3';
import { existsSync, readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomUUID } from 'crypto';
import { resolveImageUrl, isStorageConfigured } from '../services/cloudStorage.js';
import {
  inferCategoryAndTags,
  normalizeImageFingerprint,
  normalizePromptFingerprint,
} from '../services/promptTaxonomy.js';
import { normalizeGenerationCategory } from '../services/categoryPromptBlueprints.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_FILE = join(__dirname, '../data/lovioa.db');
const LEGACY_JSON = join(__dirname, '../data/prompts.json');
const GENERATED_UPLOADS_DIR = join(__dirname, '../uploads/generated');

export const CREDITS_PER_IMAGE = 5;
export const MONTHLY_CARRYOVER_RATE = 0.3;
const CREDIT_UNIT_VERSION = 2;
const BILLING_TIME_ZONE = 'Asia/Shanghai';

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 15000');

const S4_ENDPOINT = String(process.env.S4_ENDPOINT || '').trim().replace(/\/+$/, '');
const S4_BUCKET_NAME = String(process.env.S4_BUCKET_NAME || '').trim();
const S4_PUBLIC_DOMAIN = String(process.env.S4_PUBLIC_DOMAIN || '').trim().replace(/\/+$/, '');
const S3_VHOST_RE = /^https?:\/\/([^.]+)\.s3\.([^/]+)\/(.+)$/i;
const LEGACY_BLOCKED_IMAGE_HOSTS = String(process.env.LEGACY_BLOCKED_IMAGE_HOSTS || '')
  .split(',')
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function tableColumns(table) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return new Set(rows.map(r => r.name));
}

function ensureColumn(table, columnName, columnDef) {
  const cols = tableColumns(table);
  if (!cols.has(columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      image_url TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT NOT NULL,
      author_prompt_count INTEGER NOT NULL DEFAULT 0,
      tags_json TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL,
      likes INTEGER NOT NULL DEFAULT 0,
      liked INTEGER NOT NULL DEFAULT 0,
      saved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      extra_data TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prompt_tags (
      prompt_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'rule',
      confidence REAL NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      PRIMARY KEY (prompt_id, tag_id),
      FOREIGN KEY (prompt_id) REFERENCES prompts(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gen_history (
      id TEXT PRIMARY KEY,
      image_url TEXT NOT NULL,
      prompt TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT 'text',
      user_id TEXT,
      category TEXT NOT NULL DEFAULT 'Abstract',
      job_id TEXT,
      moderation_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gen_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      mode TEXT NOT NULL DEFAULT 'text',
      model TEXT NOT NULL,
      size TEXT NOT NULL,
      quality TEXT NOT NULL,
      generation_options_json TEXT NOT NULL DEFAULT '{}',
      prompt TEXT NOT NULL,
      negative_prompt TEXT NOT NULL DEFAULT '',
      reference_image_url TEXT,
      edit_strength REAL,
      dedup_key TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      queued_at TEXT,
      next_retry_at TEXT,
      last_error TEXT,
      result_image_url TEXT,
      source_channel TEXT NOT NULL DEFAULT '',
      provider_name TEXT NOT NULL DEFAULT '',
      latency_ms INTEGER NOT NULL DEFAULT 0,
      is_heartbeat INTEGER NOT NULL DEFAULT 0,
      heartbeat_run_id TEXT NOT NULL DEFAULT '',
      heartbeat_kind TEXT NOT NULL DEFAULT '',
      heartbeat_category TEXT NOT NULL DEFAULT '',
      preferred_channel TEXT NOT NULL DEFAULT '',
      priority INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS generated_images (
      id TEXT PRIMARY KEY,
      source_prompt TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      category TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      author_name TEXT NOT NULL DEFAULT 'Lovioa',
      author_avatar TEXT NOT NULL DEFAULT 'https://api.dicebear.com/7.x/miniavs/svg?seed=pf',
      author_user_id TEXT,
      likes INTEGER NOT NULL DEFAULT 0,
      liked INTEGER NOT NULL DEFAULT 0,
      saved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      gen_job_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
    CREATE INDEX IF NOT EXISTS idx_prompts_likes ON prompts(likes DESC);
    CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
    CREATE INDEX IF NOT EXISTS idx_prompt_tags_tag ON prompt_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_prompt_tags_prompt ON prompt_tags(prompt_id);
    CREATE INDEX IF NOT EXISTS idx_gen_jobs_status_retry ON gen_jobs(status, next_retry_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_gen_jobs_user ON gen_jobs(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON generated_images(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_images_category ON generated_images(category);
  `);

  ensureColumn('prompts', 'author_user_id', 'author_user_id TEXT');
  ensureColumn('gen_history', 'mode', "mode TEXT NOT NULL DEFAULT 'text'");
  ensureColumn('gen_history', 'user_id', 'user_id TEXT');
  ensureColumn('gen_history', 'job_id', 'job_id TEXT');
  ensureColumn('gen_history', 'category', "category TEXT NOT NULL DEFAULT 'Abstract'");
  ensureColumn('gen_history', 'moderation_status', "moderation_status TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn('generated_images', 'source_prompt', "source_prompt TEXT NOT NULL DEFAULT ''");
  ensureColumn('generated_images', 'model', "model TEXT NOT NULL DEFAULT ''");
  ensureColumn('generated_images', 'image_url', "image_url TEXT NOT NULL DEFAULT ''");
  ensureColumn('generated_images', 'category', "category TEXT");
  ensureColumn('generated_images', 'tags_json', "tags_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('generated_images', 'author_name', "author_name TEXT NOT NULL DEFAULT 'Lovioa'");
  ensureColumn('generated_images', 'author_avatar', "author_avatar TEXT NOT NULL DEFAULT 'https://api.dicebear.com/7.x/miniavs/svg?seed=pf'");
  ensureColumn('generated_images', 'author_user_id', 'author_user_id TEXT');
  ensureColumn('generated_images', 'likes', 'likes INTEGER NOT NULL DEFAULT 0');
  ensureColumn('generated_images', 'liked', 'liked INTEGER NOT NULL DEFAULT 0');
  ensureColumn('generated_images', 'saved', 'saved INTEGER NOT NULL DEFAULT 0');
  ensureColumn('generated_images', 'created_at', "created_at TEXT NOT NULL DEFAULT ''");
  ensureColumn('generated_images', 'gen_job_id', 'gen_job_id TEXT');

  // In case old table exists without some queue fields
  ensureColumn('gen_jobs', 'negative_prompt', "negative_prompt TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'generation_options_json', "generation_options_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('gen_jobs', 'reference_image_url', 'reference_image_url TEXT');
  ensureColumn('gen_jobs', 'edit_strength', 'edit_strength REAL');
  ensureColumn('gen_jobs', 'dedup_key', "dedup_key TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'category', "category TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'status', "status TEXT NOT NULL DEFAULT 'queued'");
  ensureColumn('gen_jobs', 'attempt_count', 'attempt_count INTEGER NOT NULL DEFAULT 0');
  ensureColumn('gen_jobs', 'max_attempts', 'max_attempts INTEGER NOT NULL DEFAULT 3');
  ensureColumn('gen_jobs', 'queued_at', 'queued_at TEXT');
  ensureColumn('gen_jobs', 'next_retry_at', 'next_retry_at TEXT');
  ensureColumn('gen_jobs', 'last_error', 'last_error TEXT');
  ensureColumn('gen_jobs', 'result_image_url', 'result_image_url TEXT');
  ensureColumn('gen_jobs', 'source_channel', "source_channel TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'provider_name', "provider_name TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'latency_ms', 'latency_ms INTEGER NOT NULL DEFAULT 0');
  ensureColumn('gen_jobs', 'is_heartbeat', 'is_heartbeat INTEGER NOT NULL DEFAULT 0');
  ensureColumn('gen_jobs', 'heartbeat_run_id', "heartbeat_run_id TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'heartbeat_kind', "heartbeat_kind TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'heartbeat_category', "heartbeat_category TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'preferred_channel', "preferred_channel TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'priority', 'priority INTEGER NOT NULL DEFAULT 0');
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_gen_jobs_heartbeat_created ON gen_jobs(is_heartbeat, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gen_jobs_provider_created ON gen_jobs(provider_name, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gen_jobs_dedup_key ON gen_jobs(dedup_key, status, created_at DESC);
  `);
  ensureColumn('gen_jobs', 'started_at', 'started_at TEXT');
  ensureColumn('gen_jobs', 'finished_at', 'finished_at TEXT');
  ensureColumn('gen_jobs', 'publish_to_prompts', 'publish_to_prompts INTEGER NOT NULL DEFAULT 1');
  ensureColumn('prompts', 'prompt_zh', "prompt_zh TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_history', 'prompt_zh', "prompt_zh TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_history', 'tags_json', "tags_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('gen_jobs', 'prompt_zh', "prompt_zh TEXT NOT NULL DEFAULT ''");
  ensureColumn('gen_jobs', 'tags_json', "tags_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('generated_images', 'prompt_zh', "prompt_zh TEXT NOT NULL DEFAULT ''");
  ensureColumn('editor_items', 'prompt_zh', "prompt_zh TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_moderation_checks (
      id TEXT PRIMARY KEY,
      request_type TEXT NOT NULL DEFAULT 'prompt',
      subject_type TEXT NOT NULL DEFAULT 'prompt',
      subject_id TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      source_prompt TEXT NOT NULL DEFAULT '',
      provider_name TEXT NOT NULL DEFAULT '',
      provider_decision TEXT NOT NULL DEFAULT 'allow',
      decision TEXT NOT NULL DEFAULT 'pass',
      score REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      labels_json TEXT NOT NULL DEFAULT '[]',
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
  `);
  ensureColumn('content_moderation_checks', 'request_type', "request_type TEXT NOT NULL DEFAULT 'prompt'");
  ensureColumn('content_moderation_checks', 'subject_type', "subject_type TEXT NOT NULL DEFAULT 'prompt'");
  ensureColumn('content_moderation_checks', 'subject_id', "subject_id TEXT NOT NULL DEFAULT ''");
  ensureColumn('content_moderation_checks', 'text_content', "text_content TEXT NOT NULL DEFAULT ''");
  ensureColumn('content_moderation_checks', 'image_url', "image_url TEXT NOT NULL DEFAULT ''");
  ensureColumn('content_moderation_checks', 'source_prompt', "source_prompt TEXT NOT NULL DEFAULT ''");
  ensureColumn('content_moderation_checks', 'provider_name', "provider_name TEXT NOT NULL DEFAULT ''");
  ensureColumn('content_moderation_checks', 'provider_decision', "provider_decision TEXT NOT NULL DEFAULT 'allow'");
  ensureColumn('content_moderation_checks', 'decision', "decision TEXT NOT NULL DEFAULT 'pass'");
  ensureColumn('content_moderation_checks', 'score', 'score REAL NOT NULL DEFAULT 0');
  ensureColumn('content_moderation_checks', 'reason', "reason TEXT NOT NULL DEFAULT ''");
  ensureColumn('content_moderation_checks', 'labels_json', "labels_json TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('content_moderation_checks', 'raw_json', "raw_json TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('content_moderation_checks', 'created_at', "created_at TEXT NOT NULL DEFAULT ''");
  ensureColumn('content_moderation_checks', 'updated_at', "updated_at TEXT NOT NULL DEFAULT ''");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_content_moderation_checks_created ON content_moderation_checks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_moderation_checks_subject ON content_moderation_checks(subject_type, subject_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_moderation_checks_decision ON content_moderation_checks(decision, created_at DESC);
  `);

  // ── Editor Batches ─────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS editor_batches (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'editor_showcase',
      status TEXT NOT NULL DEFAULT 'queued',
      planned_count INTEGER NOT NULL DEFAULT 0,
      queued_count INTEGER NOT NULL DEFAULT 0,
      succeeded_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      details_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_editor_batches_created ON editor_batches(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_editor_batches_status ON editor_batches(status, created_at DESC);
  `);

  // ── Editor Items ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS editor_items (
      id TEXT PRIMARY KEY,
      batch_id TEXT,
      prompt TEXT NOT NULL,
      edit_instruction TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      step1_job_id TEXT,
      step2_job_id TEXT,
      step1_status TEXT NOT NULL DEFAULT 'pending',
      step2_status TEXT NOT NULL DEFAULT 'pending',
      result_base_url TEXT,
      result_edited_url TEXT,
      published_to_prompts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_editor_items_step1 ON editor_items(step1_job_id);
    CREATE INDEX IF NOT EXISTS idx_editor_items_step2 ON editor_items(step2_job_id);
    CREATE INDEX IF NOT EXISTS idx_editor_items_batch ON editor_items(batch_id, created_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS heartbeat_runs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'api_stability',
      status TEXT NOT NULL DEFAULT 'running',
      planned_jobs INTEGER NOT NULL DEFAULT 0,
      queued_jobs INTEGER NOT NULL DEFAULT 0,
      succeeded_jobs INTEGER NOT NULL DEFAULT 0,
      failed_jobs INTEGER NOT NULL DEFAULT 0,
      generated_categories_json TEXT NOT NULL DEFAULT '[]',
      details_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_created ON heartbeat_runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_heartbeat_runs_status ON heartbeat_runs(status, created_at DESC);
  `);

  // Admin activity log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS gen_admin_logs (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT NOT NULL,
      admin_username TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      target_username TEXT,
      target_prompt_id TEXT,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON gen_admin_logs(admin_user_id, created_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_moderation_checks (
      id TEXT PRIMARY KEY,
      request_type TEXT NOT NULL DEFAULT 'prompt',
      subject_type TEXT NOT NULL DEFAULT 'prompt',
      subject_id TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      source_prompt TEXT NOT NULL DEFAULT '',
      provider_name TEXT NOT NULL DEFAULT '',
      provider_decision TEXT NOT NULL DEFAULT 'allow',
      decision TEXT NOT NULL DEFAULT 'pass',
      score REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      labels_json TEXT NOT NULL DEFAULT '[]',
      raw_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_content_moderation_checks_created ON content_moderation_checks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_moderation_checks_subject ON content_moderation_checks(subject_type, subject_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_moderation_checks_decision ON content_moderation_checks(decision, created_at DESC);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_prompts_author_user_id ON prompts(author_user_id);
  `);

  // ── Admin Accounts (independent from site users) ────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);

  // User sessions (token-based auth for normal users)
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, expires_at DESC);
  `);

  // Admin sessions (token-based, independent from site sessions)
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(token);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id, expires_at DESC);
  `);

  // ── Analytics ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS page_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL DEFAULT 'page_view',
      event_name TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      user_id TEXT,
      session_id TEXT NOT NULL DEFAULT '',
      device_type TEXT NOT NULL DEFAULT 'desktop',
      referrer TEXT NOT NULL DEFAULT '',
      ip_address TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      extra_data TEXT NOT NULL DEFAULT '{}',
      is_bot INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_page_events_type_time ON page_events(event_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_page_events_name_time ON page_events(event_name, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_page_events_user_time ON page_events(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_page_events_path_time ON page_events(path, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_page_events_session ON page_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_page_events_is_bot ON page_events(is_bot, created_at DESC);
  `);

  // queued_at backfill: claimNextGenJob uses COALESCE(queued_at, created_at) so
  // the UPDATE is only here for readability — no functional change. Keeping it
  // avoids any startup lock pressure by using a low busy_timeout.
  const now = nowIso();
  try {
    db.prepare(`
      UPDATE gen_jobs
      SET queued_at = COALESCE(queued_at, created_at, updated_at, ?)
      WHERE queued_at IS NULL OR queued_at = ''
    `).run(now);
  } catch (e) {
    // best-effort; claimNextGenJob falls back to created_at anyway
    if (process.env.NODE_ENV !== 'production') console.error('[migrate] queued_at backfill failed:', e);
  }

  // Backfill missing category/tags for historical AI rows.
  try {
    const backfillHistoryRows = db.prepare(`
      SELECT id, prompt
      FROM gen_history
      WHERE category IS NULL OR TRIM(category) = ''
    `).all();
    if (backfillHistoryRows.length > 0) {
      const updateHistory = db.prepare('UPDATE gen_history SET category = ? WHERE id = ?');
      const tx = db.transaction((rows) => {
        for (const r of rows) {
          const inferred = inferCategoryAndTags(r.prompt || '');
          updateHistory.run(inferred.category || 'Generated', r.id);
        }
      });
      tx(backfillHistoryRows);
    }
  } catch (e) {
    console.warn('[migrate] gen_history backfill skipped (may already be complete):', e?.message);
  }

  try {
    const backfillGeneratedRows = db.prepare(`
      SELECT id, source_prompt, tags_json
      FROM generated_images
      WHERE category IS NULL OR TRIM(category) = ''
    `).all();
    if (backfillGeneratedRows.length > 0) {
      const updateGenerated = db.prepare('UPDATE generated_images SET category = ?, tags_json = ? WHERE id = ?');
      const tx = db.transaction((rows) => {
        for (const r of rows) {
          const inferred = inferCategoryAndTags(r.source_prompt || '');
          const tags = safeParseTags(r.tags_json || '[]');
          const finalTags = tags.length ? tags : inferred.tags;
          updateGenerated.run(inferred.category || 'Generated', JSON.stringify(finalTags || []), r.id);
        }
      });
      tx(backfillGeneratedRows);
    }
  } catch (e) {
    console.warn('[migrate] generated_images backfill skipped (may already be complete):', e?.message);
  }
}

function nowIso() { return new Date().toISOString(); }

function getBillingMonthKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BILLING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}`;
}

function nextBillingMonth(monthKey) {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month)) return getBillingMonthKey();
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

function migrateLegacyCreditBalances() {
  const legacyRows = db.prepare(`
    SELECT user_id, free_credits, paid_credits, monthly_credit_quota, credit_period
    FROM user_balance
    WHERE credits_unit_version < ?
  `).all(CREDIT_UNIT_VERSION);
  if (legacyRows.length === 0) return;

  const currentPeriod = getBillingMonthKey();
  const update = db.prepare(`
    UPDATE user_balance
    SET free_credits = ?,
        paid_credits = ?,
        monthly_credit_quota = ?,
        credit_period = ?,
        credits_unit_version = ?,
        updated_at = ?
    WHERE user_id = ?
  `);
  const migrate = db.transaction((rows) => {
    for (const row of rows) {
      const freeCredits = Math.max(0, Number(row.free_credits) || 0) * CREDITS_PER_IMAGE;
      const paidCredits = Math.max(0, Number(row.paid_credits) || 0) * CREDITS_PER_IMAGE;
      const existingQuota = Math.max(0, Number(row.monthly_credit_quota) || 0);
      const monthlyQuota = Math.max(
        freeCredits + paidCredits,
        existingQuota * CREDITS_PER_IMAGE,
      );
      update.run(
        freeCredits,
        paidCredits,
        monthlyQuota,
        String(row.credit_period || '').trim() || currentPeriod,
        CREDIT_UNIT_VERSION,
        nowIso(),
        row.user_id,
      );
    }
  });
  migrate(legacyRows);
}

function migrateLegacyRedeemCards() {
  const legacyCards = db.prepare(`
    SELECT id, credits
    FROM redeem_cards
    WHERE credits_unit_version < ?
  `).all(CREDIT_UNIT_VERSION);
  if (legacyCards.length === 0) return;

  const update = db.prepare(`
    UPDATE redeem_cards
    SET credits = ?, credits_unit_version = ?
    WHERE id = ?
  `);
  const migrate = db.transaction((cards) => {
    for (const card of cards) {
      update.run(
        Math.max(0, Number(card.credits) || 0) * CREDITS_PER_IMAGE,
        CREDIT_UNIT_VERSION,
        card.id,
      );
    }
  });
  migrate(legacyCards);
}

function normalizePublicImageUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  if (url.startsWith('data:')) return '/image-placeholder.svg';

  if (S4_PUBLIC_DOMAIN && url.startsWith(`${S4_PUBLIC_DOMAIN}/${S4_BUCKET_NAME}/`)) {
    return url.replace(`${S4_PUBLIC_DOMAIN}/${S4_BUCKET_NAME}/`, `${S4_PUBLIC_DOMAIN}/`);
  }

  // Fix historical virtual-host URLs missing the bucket path segment.
  if (S4_ENDPOINT && S4_BUCKET_NAME) {
    const expectedPrefix = `${S4_ENDPOINT}/${S4_BUCKET_NAME}/`;
    if (url.startsWith(`${S4_ENDPOINT}/`) && !url.startsWith(expectedPrefix)) {
      return url.replace(`${S4_ENDPOINT}/`, expectedPrefix);
    }
  } else {
    const m = url.match(S3_VHOST_RE);
    if (m) {
      const bucket = m[1];
      const domain = m[2];
      const key = m[3];
      // If key already contains "<bucket>/...", keep it as-is to avoid
      // duplicating bucket segment (e.g. /lovioa-gallery/lovioa-gallery/...).
      if (key.startsWith(`${bucket}/`)) {
        return `https://${bucket}.s3.${domain}/${key}`;
      }
      return `https://${bucket}.s3.${domain}/${bucket}/${key}`;
    }
  }

  if (LEGACY_BLOCKED_IMAGE_HOSTS.length > 0) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      if (LEGACY_BLOCKED_IMAGE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
        return '/image-placeholder.svg';
      }
    } catch {
      return '/image-placeholder.svg';
    }
  }

  return url;
}

function extFromMime(mime = '') {
  const m = String(mime).toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'png';
}

function materializeDataUrlIfNeeded(rawUrl, idPrefix = 'gen') {
  const imageUrl = String(rawUrl || '');
  if (!imageUrl.startsWith('data:')) return imageUrl;
  const m = /^data:([^;]+);base64,(.+)$/i.exec(imageUrl);
  if (!m) return '';

  try {
    if (!existsSync(GENERATED_UPLOADS_DIR)) {
      mkdirSync(GENERATED_UPLOADS_DIR, { recursive: true });
    }
    const mime = m[1] || 'image/png';
    const b64 = m[2] || '';
    const buf = Buffer.from(b64, 'base64');
    const ext = extFromMime(mime);
    const fileName = `${idPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = join(GENERATED_UPLOADS_DIR, fileName);
    writeFileSync(filePath, buf);
    return `/uploads/generated/${fileName}`;
  } catch {
    // Fail closed: never persist raw base64 if materialization fails.
    return '';
  }
}

function safeParseTags(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function slugifyTag(name = '') {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-\u4e00-\u9fff]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function normalizeTagList(tags = [], limit = 12) {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .map(t => String(t || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(1, Number(limit || 12)));
  return [...new Set(cleaned)];
}

function ensureTagIdByName(name) {
  const tagName = String(name || '').trim();
  if (!tagName) return null;
  const slug = slugifyTag(tagName);
  if (!slug) return null;
  const existing = db.prepare('SELECT id FROM tags WHERE slug = ?').get(slug);
  if (existing?.id) return existing.id;
  try {
    db.prepare('INSERT INTO tags (name, slug, created_at) VALUES (?, ?, ?)').run(tagName, slug, nowIso());
  } catch (e) {
    // unique race: another concurrent call inserted it — safe to ignore
    if (!e.message?.includes('UNIQUE') && !e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      console.warn('[tags] ensureTagIdByName insert failed:', e?.message);
    }
  }
  const row = db.prepare('SELECT id FROM tags WHERE slug = ?').get(slug);
  return row?.id || null;
}

function replacePromptTagRelations(promptId, tags = [], { source = 'rule', confidence = 1 } = {}) {
  const normalized = normalizeTagList(tags, 12);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM prompt_tags WHERE prompt_id = ?').run(promptId);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO prompt_tags (prompt_id, tag_id, source, confidence, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const tag of normalized) {
      const tagId = ensureTagIdByName(tag);
      if (!tagId) continue;
      insert.run(promptId, tagId, source, Number(confidence || 1), nowIso());
    }
  });
  tx();
}

function hydratePromptTagsFromJson() {
  try {
    const rows = db.prepare('SELECT id, tags_json FROM prompts').all();
    if (!rows.length) return;
    for (const row of rows) {
      const tags = safeParseTags(row.tags_json || '[]');
      if (tags.length === 0) continue;
      const exists = db.prepare('SELECT COUNT(1) AS c FROM prompt_tags WHERE prompt_id = ?').get(row.id)?.c || 0;
      if (exists > 0) continue;
      replacePromptTagRelations(row.id, tags, { source: 'seed', confidence: 1 });
    }
  } catch (e) {
    console.warn('[migrate] hydratePromptTagsFromJson skipped:', e?.message);
  }
}

function normalizeCategoryFromContent({ promptText = '', tags = [], manualCategory = '' } = {}) {
  const explicit = normalizeGenerationCategory(manualCategory);
  if (explicit) return explicit;
  const mergedText = `${String(promptText || '')} ${(Array.isArray(tags) ? tags.join(' ') : '')}`.trim();
  const inferred = inferCategoryAndTags(mergedText);
  return inferred.category || 'Generated';
}

function recategorizePromptsFromContent() {
  // Categories are selected before generation. Historical repair is explicit
  // and must not silently relabel records on every server boot.
}

export function rowToPrompt(row) {
  return {
    id: row.id,
    imageUrl: normalizePublicImageUrl(row.image_url),
    prompt: row.prompt,
    promptZh: row.prompt_zh || '',
    author: {
      name: row.author_name,
      avatar: row.author_avatar,
      promptCount: row.author_prompt_count,
      userId: row.author_user_id || null,
    },
    tags: JSON.parse(row.tags_json || '[]'),
    category: row.category,
    likes: row.likes,
    liked: !!row.liked,
    saved: !!row.saved,
    createdAt: row.created_at,
  };
}

function rowToHistory(row) {
  return {
    id: row.id,
    imageUrl: normalizePublicImageUrl(row.image_url),
    prompt: row.prompt,
    promptZh: row.prompt_zh || '',
    tags: safeParseTags(row.tags_json || '[]'),
    model: row.model,
    mode: row.mode,
    userId: row.user_id,
    category: row.category || 'Generated',
    moderationStatus: row.moderation_status || 'pending',
    createdAt: row.created_at,
  };
}

function rowToGenJob(row) {
  let generationOptions = {};
  try { generationOptions = JSON.parse(row.generation_options_json || '{}'); } catch { generationOptions = {}; }
  return {
    id: row.id,
    userId: row.user_id,
    mode: row.mode,
    model: row.model,
    size: row.size,
    quality: row.quality,
    generationOptions,
    prompt: row.prompt,
    promptZh: row.prompt_zh || '',
    negativePrompt: row.negative_prompt,
    referenceImageUrl: row.reference_image_url,
    publishToPrompts: !!row.publish_to_prompts,
    status: row.status,
    editStrength: row.edit_strength,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    queuedAt: row.queued_at,
    nextRetryAt: row.next_retry_at,
    lastError: row.last_error,
    resultImageUrl: row.result_image_url,
    sourceChannel: row.source_channel || '',
    providerName: row.provider_name || '',
    latencyMs: Number(row.latency_ms || 0),
    isHeartbeat: !!row.is_heartbeat,
    heartbeatRunId: row.heartbeat_run_id || '',
    heartbeatKind: row.heartbeat_kind || '',
    heartbeatCategory: row.heartbeat_category || '',
    preferredChannel: row.preferred_channel || '',
    priority: Number(row.priority || 0),
    dedupKey: row.dedup_key || '',
    category: normalizeGenerationCategory(row.category) || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function rowToHeartbeatRun(row) {
  let generatedCategories = [];
  let details = {};
  try { generatedCategories = JSON.parse(row.generated_categories_json || '[]'); } catch { generatedCategories = []; }
  try { details = JSON.parse(row.details_json || '{}'); } catch { details = {}; }
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    plannedJobs: Number(row.planned_jobs || 0),
    queuedJobs: Number(row.queued_jobs || 0),
    succeededJobs: Number(row.succeeded_jobs || 0),
    failedJobs: Number(row.failed_jobs || 0),
    generatedCategories: Array.isArray(generatedCategories) ? generatedCategories : [],
    details,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToContentModerationCheck(row) {
  let labels = [];
  let raw = {};
  try { labels = JSON.parse(row.labels_json || '[]'); } catch { labels = []; }
  try { raw = JSON.parse(row.raw_json || '{}'); } catch { raw = {}; }
  return {
    id: row.id,
    requestType: row.request_type || 'prompt',
    subjectType: row.subject_type || 'prompt',
    subjectId: row.subject_id || '',
    textContent: row.text_content || '',
    imageUrl: row.image_url || '',
    sourcePrompt: row.source_prompt || '',
    providerName: row.provider_name || '',
    providerDecision: row.provider_decision || 'allow',
    decision: row.decision || 'pass',
    score: Number(row.score || 0),
    reason: row.reason || '',
    labels: Array.isArray(labels) ? labels : [],
    raw,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function seedFromLegacyJsonIfEmpty() {
  const count = db.prepare('SELECT COUNT(1) AS c FROM prompts').get().c;
  if (count > 0) return;
  if (!existsSync(LEGACY_JSON)) return;

  const raw = JSON.parse(readFileSync(LEGACY_JSON, 'utf-8'));
  if (!Array.isArray(raw) || raw.length === 0) return;

  const insert = db.prepare(`
    INSERT INTO prompts (
      id, image_url, prompt, author_name, author_avatar, author_prompt_count,
      tags_json, category, likes, liked, saved, created_at
    ) VALUES (
      @id, @image_url, @prompt, @author_name, @author_avatar, @author_prompt_count,
      @tags_json, @category, @likes, @liked, @saved, @created_at
    )
  `);

  const tx = db.transaction((items) => {
    for (const p of items) {
      insert.run({
        id: p.id,
        image_url: p.imageUrl || '',
        prompt: p.prompt || '',
        author_name: p.author?.name || 'Anonymous',
        author_avatar: p.author?.avatar || '',
        author_prompt_count: Number(p.author?.promptCount || 0),
        tags_json: JSON.stringify(Array.isArray(p.tags) ? p.tags : []),
        category: p.category || 'Portrait',
        likes: Number(p.likes || 0),
        liked: p.liked ? 1 : 0,
        saved: p.saved ? 1 : 0,
        created_at: p.createdAt || new Date().toISOString().slice(0, 10),
      });
    }
  });

  tx(raw);
}

migrate();
// page_events is created inside migrate(); ensure optional columns afterwards.
  ensureColumn('page_events', 'is_bot', 'is_bot INTEGER NOT NULL DEFAULT 0');
  ensureColumn('page_events', 'ip_address', "ip_address TEXT NOT NULL DEFAULT ''");
  ensureColumn('page_events', 'country', "country TEXT NOT NULL DEFAULT ''");
  ensureColumn('page_events', 'region', "region TEXT NOT NULL DEFAULT ''");
  ensureColumn('page_events', 'city', "city TEXT NOT NULL DEFAULT ''");
ensureColumn('users', 'is_admin', 'is_admin INTEGER NOT NULL DEFAULT 0');
ensureColumn('users', 'onboarding_source', 'onboarding_source TEXT NOT NULL DEFAULT \'[]\'');
ensureColumn('users', 'onboarding_role', 'onboarding_role TEXT NOT NULL DEFAULT \'\'');
ensureColumn('users', 'onboarding_use_case', 'onboarding_use_case TEXT NOT NULL DEFAULT \'[]\'');
ensureColumn('users', 'onboarding_completed_at', 'onboarding_completed_at TEXT NOT NULL DEFAULT \'\'');
ensureColumn('users', 'domestic_plan', 'domestic_plan TEXT');
ensureColumn('users', 'domestic_plan_redeemed_at', 'domestic_plan_redeemed_at TEXT');
ensureColumn('users', 'domestic_redeem_card_id', 'domestic_redeem_card_id TEXT');
ensureColumn('prompts', 'extra_data', 'extra_data TEXT NOT NULL DEFAULT \'{}\'');

// ── Billing ────────────────────────────────────────────────────────────────────
// subscriptions table
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    stripe_subscription_id TEXT,
    stripe_customer_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    current_period_start TEXT,
    current_period_end TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_subs_stripe ON subscriptions(stripe_subscription_id);
`);

// user_balance table
db.exec(`
  CREATE TABLE IF NOT EXISTS user_balance (
    user_id TEXT PRIMARY KEY,
    free_credits INTEGER NOT NULL DEFAULT 0,
    paid_credits INTEGER NOT NULL DEFAULT 0,
    lifetime_generations INTEGER NOT NULL DEFAULT 0,
    monthly_credit_quota INTEGER NOT NULL DEFAULT 0,
    credit_period TEXT NOT NULL DEFAULT '',
    credits_unit_version INTEGER NOT NULL DEFAULT 2,
    updated_at TEXT NOT NULL
  );
`);
ensureColumn('user_balance', 'monthly_credit_quota', 'monthly_credit_quota INTEGER NOT NULL DEFAULT 0');
ensureColumn('user_balance', 'credit_period', "credit_period TEXT NOT NULL DEFAULT ''");
ensureColumn('user_balance', 'credits_unit_version', 'credits_unit_version INTEGER NOT NULL DEFAULT 1');
migrateLegacyCreditBalances();

db.exec(`
  CREATE TABLE IF NOT EXISTS redeem_cards (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    code_last4 TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    credits INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    redeemed_by TEXT,
    redeemed_at TEXT,
    imported_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'domestic',
    credits_unit_version INTEGER NOT NULL DEFAULT 2
  );
  CREATE INDEX IF NOT EXISTS idx_redeem_cards_status ON redeem_cards(status);
  CREATE INDEX IF NOT EXISTS idx_redeem_cards_plan ON redeem_cards(plan_id);
  CREATE INDEX IF NOT EXISTS idx_redeem_cards_redeemed_by ON redeem_cards(redeemed_by);
`);
ensureColumn('redeem_cards', 'credits_unit_version', 'credits_unit_version INTEGER NOT NULL DEFAULT 1');
migrateLegacyRedeemCards();

// Daily login rewards are keyed by the user's local calendar date.
db.exec(`
  CREATE TABLE IF NOT EXISTS user_daily_rewards (
    user_id TEXT NOT NULL,
    reward_date TEXT NOT NULL,
    credits INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, reward_date)
  );
  CREATE INDEX IF NOT EXISTS idx_user_daily_rewards_user
    ON user_daily_rewards(user_id, reward_date DESC);
`);

// Stripe webhook log table
db.exec(`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      processed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);
`);

seedFromLegacyJsonIfEmpty();
const RUN_STARTUP_BACKFILL = String(process.env.RUN_STARTUP_BACKFILL || 'false').toLowerCase() === 'true';
if (RUN_STARTUP_BACKFILL) {
  recategorizePromptsFromContent();
  hydratePromptTagsFromJson();
}

// Users
export function createUser({ id, username, email, passwordHash, avatar }) {
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, avatar, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, username, email.toLowerCase(), passwordHash, avatar, nowIso());
  // Give 6 free image generations as points on registration.
  db.prepare(`
    INSERT OR IGNORE INTO user_balance (
      user_id, free_credits, paid_credits, lifetime_generations,
      monthly_credit_quota, credit_period, credits_unit_version, updated_at
    )
    VALUES (?, ?, 0, 0, ?, ?, ?, ?)
  `).run(
    id,
    CREDITS_PER_IMAGE * 6,
    CREDITS_PER_IMAGE * 6,
    getBillingMonthKey(),
    CREDIT_UNIT_VERSION,
    nowIso(),
  );
  claimDailyLoginReward(id, { grant: false });
  return getUserById(id);
}

export function getUserById(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row ? rowToUser(row) : null;
}

export function getUserByEmail(email) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  return row ? rowToUser(row) : null;
}

export function getUserByUsername(username) {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  return row ? rowToUser(row) : null;
}

export function updateUserPasswordHash(userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
  return getUserById(userId);
}

export function saveOnboardingData(userId, { source = [], role = '', useCase = [], completedAt = '' }) {
  const sourceJson = JSON.stringify(Array.isArray(source) ? source : []);
  const useCaseJson = JSON.stringify(Array.isArray(useCase) ? useCase : []);
  db.prepare(`
    UPDATE users
    SET onboarding_source = ?, onboarding_role = ?, onboarding_use_case = ?, onboarding_completed_at = ?
    WHERE id = ?
  `).run(sourceJson, role || '', useCaseJson, completedAt || new Date().toISOString());
  return getUserById(userId);
}

function hashResetToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function createPasswordResetToken({ userId, token, ttlMinutes = 30 }) {
  const now = nowIso();
  const expiresAt = new Date(Date.now() + Math.max(1, Number(ttlMinutes || 30)) * 60 * 1000).toISOString();
  const tokenHash = hashResetToken(token);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? OR expires_at <= ?').run(userId, now);
    db.prepare(`
      INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
      VALUES (?, ?, ?, ?, NULL, ?)
    `).run(randomUUID(), userId, tokenHash, expiresAt, now);
  });

  tx();
  return { token, expiresAt };
}

export function consumePasswordResetToken(token) {
  const now = nowIso();
  const tokenHash = hashResetToken(token);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM password_reset_tokens WHERE expires_at <= ?').run(now);
    const row = db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
      LIMIT 1
    `).get(tokenHash, now);
    if (!row) return null;
    const result = db.prepare(`
      UPDATE password_reset_tokens
      SET used_at = ?
      WHERE id = ? AND used_at IS NULL
    `).run(now, row.id);
    if (result.changes !== 1) return null;
    return row.user_id;
  });

  return tx();
}

function rowToUser(row, extra = {}) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    avatar: row.avatar,
    passwordHash: row.password_hash,
    isAdmin: !!row.is_admin,
    // Use pre-computed prompt_count from JOIN queries when available; otherwise compute.
    promptCount: (extra.promptCount !== undefined) ? extra.promptCount : (db.prepare('SELECT COUNT(1) AS c FROM prompts WHERE author_user_id = ?').get(row.id)?.c || 0),
    createdAt: row.created_at,
  };
}

// Prompts
export function listPrompts({ category, search, sort, authorUserId, limit = 500, offset = 0 } = {}) {
  const where = [];
  const params = {};
  const normalizedLimit = Math.max(1, Math.min(500, Number(limit || 500)));
  const normalizedOffset = Math.max(0, Number(offset || 0));

  if (category && category !== 'Latest' && category !== 'Popular' && category !== 'Generated') {
    where.push('category = @category');
    params.category = category;
  }

  if (search && String(search).trim()) {
    where.push('(LOWER(prompt) LIKE @q OR LOWER(prompt_zh) LIKE @q OR LOWER(tags_json) LIKE @q OR LOWER(category) LIKE @q OR LOWER(author_name) LIKE @q)');
    params.q = `%${String(search).toLowerCase()}%`;
  }

  if (authorUserId) {
    where.push('author_user_id = @authorUserId');
    params.authorUserId = authorUserId;
  }

  let orderBy = 'created_at DESC';
  if (sort === 'popular' || category === 'Popular') orderBy = 'likes DESC, created_at DESC';

  const sql = `
    SELECT
      id,
      CASE WHEN image_url LIKE 'data:%' THEN '/image-placeholder.svg' ELSE image_url END AS image_url,
      prompt, author_name, author_avatar, author_prompt_count, author_user_id,
      tags_json, category, likes, liked, saved, created_at, prompt_zh
    FROM prompts
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${orderBy}
    LIMIT @limit OFFSET @offset
  `;
  params.limit = Math.min(2000, normalizedLimit * 4);
  params.offset = normalizedOffset;
  const rows = db.prepare(sql).all(params).map(rowToPrompt);

  if (!authorUserId) {
    const byId = new Map();
    const byImage = new Set();
    const byPrompt = new Set();
    for (const item of rows) {
      if (byId.has(item.id)) continue;
      const isGenerated = String(item.id || '').startsWith('gen-');
      const imageKey = isGenerated ? normalizeImageFingerprint(item.imageUrl) : '';
      const promptKey = isGenerated ? normalizePromptFingerprint(item.prompt) : '';
      if (imageKey && byImage.has(imageKey)) continue;
      if (promptKey && byPrompt.has(promptKey)) continue;
      byId.set(item.id, item);
      if (imageKey) byImage.add(imageKey);
      if (promptKey) byPrompt.add(promptKey);
      if (byId.size >= normalizedLimit) break;
    }
    return [...byId.values()];
  }

  return rows;
}

export function getPromptById(id) {
  const row = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
  return row ? rowToPrompt(row) : null;
}

/**
 * Returns prompts that were published from the editor workflow (have extra_data with originalImageUrl).
 * These represent the before/after image editing showcase items.
 */
export function getEditorShowcaseItems({ limit = 30 } = {}) {
  // Gracefully handle if extra_data column doesn't exist yet (pre-migration)
  let rows;
  try {
    rows = db.prepare(`
      SELECT id, image_url, prompt, author_name, author_avatar, author_prompt_count,
      tags_json, category, likes, liked, saved, created_at, author_user_id, prompt_zh,
             extra_data
      FROM prompts
      WHERE extra_data LIKE '%originalImageUrl%'
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  } catch (_) {
    // Column not yet added; skip editor items until migration runs
    return [];
  }

  return rows.map(row => {
    const prompt = rowToPrompt(row);
    const extra = JSON.parse(row.extra_data || '{}');
    return {
      ...prompt,
      originalImageUrl: normalizePublicImageUrl(extra.originalImageUrl || ''),
      editInstruction: extra.editInstruction || '',
    };
  });
}

export function createPrompt(newPrompt) {
  const normalizedTags = Array.isArray(newPrompt.tags) ? newPrompt.tags.filter(Boolean).slice(0, 8) : [];
  const normalizedCategory = normalizeCategoryFromContent({
    promptText: newPrompt.prompt || '',
    tags: normalizedTags,
    manualCategory: newPrompt.category || 'Generated',
  });
  const normalizedImageUrl = materializeDataUrlIfNeeded(newPrompt.imageUrl, 'prompt');

  db.prepare(`
    INSERT INTO prompts (
      id, image_url, prompt, author_name, author_avatar, author_prompt_count, author_user_id,
      tags_json, category, likes, liked, saved, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newPrompt.id,
    normalizedImageUrl,
    newPrompt.prompt,
    newPrompt.author.name,
    newPrompt.author.avatar,
    Number(newPrompt.author.promptCount || 0),
    newPrompt.author.userId || null,
    JSON.stringify(normalizedTags),
    normalizedCategory,
    Number(newPrompt.likes || 0),
    newPrompt.liked ? 1 : 0,
    newPrompt.saved ? 1 : 0,
    newPrompt.createdAt,
  );
  replacePromptTagRelations(newPrompt.id, normalizedTags, { source: 'rule', confidence: 1 });
  return getPromptById(newPrompt.id);
}

export function toggleLike(id) {
  const row = db.prepare('SELECT likes, liked FROM prompts WHERE id = ?').get(id);
  if (!row) return null;
  const liked = row.liked ? 0 : 1;
  const likes = row.likes + (liked ? 1 : -1);
  db.prepare('UPDATE prompts SET liked = ?, likes = ? WHERE id = ?').run(liked, likes, id);
  return getPromptById(id);
}

export function toggleSave(id) {
  const row = db.prepare('SELECT saved FROM prompts WHERE id = ?').get(id);
  if (!row) return null;
  const saved = row.saved ? 0 : 1;
  db.prepare('UPDATE prompts SET saved = ? WHERE id = ?').run(saved, id);
  return getPromptById(id);
}

export function deletePrompt(id) {
  const res = db.prepare('DELETE FROM prompts WHERE id = ?').run(id);
  return res.changes > 0;
}

export function listPromptRowsForTagging({ limit = 100, offset = 0, includeTagged = false, category = '' } = {}) {
  const params = {
    limit: Math.max(1, Math.min(1000, Number(limit || 100))),
    offset: Math.max(0, Number(offset || 0)),
  };
  const where = [];
  if (!includeTagged) {
    where.push(`(p.tags_json IS NULL OR p.tags_json = '' OR p.tags_json = '[]')`);
  }
  if (category) {
    where.push('p.category = @category');
    params.category = category;
  }
  const sql = `
    SELECT p.id, p.prompt, p.tags_json, p.category, p.created_at
    FROM prompts p
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY p.created_at DESC
    LIMIT @limit OFFSET @offset
  `;
  return db.prepare(sql).all(params).map((row) => ({
    id: row.id,
    prompt: row.prompt || '',
    tags: safeParseTags(row.tags_json || '[]'),
    category: row.category || 'Generated',
    createdAt: row.created_at,
  }));
}

export function applyPromptTagging({ promptId, category, tags = [], source = 'llm', confidence = 0.8 }) {
  const normalizedTags = normalizeTagList(tags, 12);
  const normalizedCategory = String(category || '').trim() || 'Generated';
  const current = getPromptById(promptId);
  if (!current) return null;
  const mergedTags = normalizedTags.length ? normalizedTags : current.tags;
  db.prepare(`
    UPDATE prompts
    SET category = @category, tags_json = @tagsJson
    WHERE id = @id
  `).run({
    id: promptId,
    category: normalizedCategory,
    tagsJson: JSON.stringify(mergedTags),
  });
  replacePromptTagRelations(promptId, mergedTags, { source, confidence });
  return getPromptById(promptId);
}

export function countPromptRowsForTagging({ includeTagged = false, category = '' } = {}) {
  const params = {};
  const where = [];
  if (!includeTagged) where.push(`(tags_json IS NULL OR tags_json = '' OR tags_json = '[]')`);
  if (category) {
    where.push('category = @category');
    params.category = category;
  }
  const sql = `SELECT COUNT(1) AS c FROM prompts ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  return db.prepare(sql).get(params)?.c || 0;
}

// Stats
export function getStats() {
  const promptsCount = db.prepare('SELECT COUNT(1) AS c FROM prompts').get().c;
  const imagesGenerated = db.prepare('SELECT COUNT(1) AS c FROM gen_history').get().c;
  const communitySize = db.prepare('SELECT COUNT(DISTINCT author_user_id) AS c FROM prompts WHERE author_user_id IS NOT NULL').get().c;
  return { promptsShared: promptsCount, imagesGenerated, communitySize };
}

// Generation History
export function listHistory(userId) {
  if (userId) return db.prepare('SELECT * FROM gen_history WHERE user_id = ? ORDER BY created_at DESC').all(userId).map(rowToHistory);
  return db.prepare('SELECT * FROM gen_history ORDER BY created_at DESC').all().map(rowToHistory);
}

export function getHistoryById(id) {
  const row = db.prepare('SELECT * FROM gen_history WHERE id = ?').get(id);
  return row ? rowToHistory(row) : null;
}

function shouldAutoPublishGenerated({ userId, publishToPrompts }) {
  if (typeof publishToPrompts === 'boolean') return publishToPrompts;
  if (!userId) return false;
  const user = getUserById(userId);
  return !!user?.isAdmin; // only admin users auto-publish to global feed
}

export function addHistory({ imageUrl, prompt, model, mode, userId, jobId, category = '', publishToPrompts }) {
  if (jobId) {
    const existing = db.prepare('SELECT * FROM gen_history WHERE job_id = ? LIMIT 1').get(jobId);
    if (existing) return rowToHistory(existing);
  }

  const id = randomUUID();
  const createdAt = nowIso();
  const shouldPublish = shouldAutoPublishGenerated({ userId, publishToPrompts });
  const moderationStatus = shouldPublish ? 'approved' : 'pending';
  const normalizedImageUrl = materializeDataUrlIfNeeded(imageUrl, 'gen');
  if (!normalizedImageUrl) {
    throw new Error('INVALID_IMAGE_URL');
  }

  const inferred = inferCategoryAndTags(prompt || '');
  const explicitCategory = normalizeGenerationCategory(category);
  // The category is selected before generation. Content inference is only a
  // fallback for legacy callers that did not provide generation metadata.
  const normalizedCategory = explicitCategory || inferred.category || 'Generated';

  // Always keep a complete generation history.
  db.prepare('INSERT INTO gen_history (id, image_url, prompt, model, mode, user_id, category, moderation_status, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, normalizedImageUrl, prompt, model || '', mode || 'text', userId || null, normalizedCategory, moderationStatus, jobId || null, createdAt);

  // Only developer/internal/admin generated images are auto-published.
  if (shouldPublish) {
    const finalCat = normalizedCategory;
    const user = userId ? getUserById(userId) : null;
    const promptsId = `gen-${id}`;

    // Write to both prompts (community feed) and generated_images (gallery).
    const tx = db.transaction(() => {
      db.prepare(`
        INSERT OR IGNORE INTO prompts (
          id, image_url, prompt, author_name, author_avatar, author_prompt_count, author_user_id,
          tags_json, category, likes, liked, saved, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
      `).run(
        promptsId,
        normalizedImageUrl,
        prompt || '',
        user?.username || 'Lovioa',
        user?.avatar || 'https://api.dicebear.com/7.x/miniavs/svg?seed=pf',
        0,
        userId || null,
        JSON.stringify(inferred.tags),
        finalCat,
        createdAt,
      );
      // Sync to generated_images so the gallery always reads from one source.
      db.prepare(`
        INSERT OR IGNORE INTO generated_images (
          id, source_prompt, model, image_url, category, tags_json,
          author_name, author_avatar, author_user_id, gen_job_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        prompt || '',
        model || '',
        normalizedImageUrl,
        finalCat,
        JSON.stringify(inferred.tags),
        user?.username || 'Lovioa',
        user?.avatar || 'https://api.dicebear.com/7.x/miniavs/svg?seed=pf',
        userId || null,
        jobId || null,
        createdAt,
      );
    });
    tx();
  }

  return rowToHistory(db.prepare('SELECT * FROM gen_history WHERE id = ?').get(id));
}

// ── Moderate pending history items ─────────────────────────────────────────
export function approveHistory(id) {
  const row = db.prepare('SELECT * FROM gen_history WHERE id = ?').get(id);
  if (!row) return null;

  db.prepare("UPDATE gen_history SET moderation_status = 'approved' WHERE id = ?").run(id);

  // Also insert into prompts table (single source of truth for approved content)
  // and generated_images (gallery source) — all in one transaction.
  const inferred = inferCategoryAndTags(row.prompt || '');
  const finalCategory = normalizeGenerationCategory(row.category) || inferred.category || 'Generated';
  const user = row.user_id ? getUserById(row.user_id) : null;
  const promptsId = `gen-${id}`;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT OR IGNORE INTO prompts (
        id, image_url, prompt, author_name, author_avatar, author_prompt_count, author_user_id,
        tags_json, category, likes, liked, saved, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)
    `).run(
      promptsId,
      row.image_url,
      row.prompt || '',
      user?.username || 'Lovioa',
      user?.avatar || 'https://api.dicebear.com/7.x/miniavs/svg?seed=pf',
      0,
      row.user_id || null,
      JSON.stringify(inferred.tags),
      finalCategory,
      row.created_at,
    );
    db.prepare(`
      INSERT OR IGNORE INTO generated_images (
        id, source_prompt, model, image_url, category, tags_json,
        author_name, author_avatar, author_user_id, gen_job_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      row.prompt || '',
      row.model || '',
      row.image_url,
      finalCategory,
      JSON.stringify(inferred.tags),
      user?.username || 'Lovioa',
      user?.avatar || 'https://api.dicebear.com/7.x/miniavs/svg?seed=pf',
      row.user_id || null,
      row.job_id || null,
      row.created_at,
    );
  });
  tx();

  return rowToHistory(db.prepare('SELECT * FROM gen_history WHERE id = ?').get(id));
}

export function rejectHistory(id) {
  db.prepare("UPDATE gen_history SET moderation_status = 'rejected' WHERE id = ?").run(id);
  return rowToHistory(db.prepare('SELECT * FROM gen_history WHERE id = ?').get(id));
}

export function rowToModerationItem(row) {
  const check = rowToContentModerationCheck(row);
  const historyId = row.subject_type === 'generated_image' && row.subject_id ? row.subject_id : '';
  const historyRow = historyId ? db.prepare('SELECT * FROM gen_history WHERE id = ?').get(historyId) : null;
  const promptRow = historyId ? db.prepare('SELECT * FROM prompts WHERE id = ?').get(`gen-${historyId}`) : null;
  const generatedRow = historyId ? db.prepare('SELECT * FROM generated_images WHERE id = ?').get(historyId) : null;
  return {
    ...check,
    historyId: historyId || null,
    historyStatus: historyRow?.moderation_status || null,
    historyImageUrl: historyRow?.image_url || '',
    historyPrompt: historyRow?.prompt || '',
    historyCategory: historyRow?.category || '',
    promptExists: !!promptRow,
    generatedExists: !!generatedRow,
    imageUrl: check.imageUrl || historyRow?.image_url || generatedRow?.image_url || '',
    prompt: check.sourcePrompt || check.textContent || historyRow?.prompt || '',
    category: historyRow?.category || generatedRow?.category || 'Generated',
  };
}

export function listModerationChecks({ requestType = '', subjectType = '', decision = '', limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit || 50))),
    offset: Math.max(0, Number(offset || 0)),
  };
  if (requestType) {
    where.push('request_type = @requestType');
    params.requestType = requestType;
  }
  if (subjectType) {
    where.push('subject_type = @subjectType');
    params.subjectType = subjectType;
  }
  if (decision) {
    where.push('decision = @decision');
    params.decision = decision;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM content_moderation_checks
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `).all(params).map(rowToModerationItem);
  const total = db.prepare(`
    SELECT COUNT(1) AS c FROM content_moderation_checks
    ${whereSql}
  `).get(params)?.c || 0;
  return { items: rows, total };
}

export function approveModerationCheck(id) {
  const row = db.prepare('SELECT * FROM content_moderation_checks WHERE id = ?').get(id);
  if (!row) return null;
  const updated = updateContentModerationCheck(id, {
    decision: 'pass',
    providerDecision: row.provider_decision || 'allow',
  });
  if (row.subject_type === 'generated_image' && row.subject_id) {
    approveHistory(row.subject_id);
  }
  return updated ? rowToModerationItem(db.prepare('SELECT * FROM content_moderation_checks WHERE id = ?').get(id)) : null;
}

export function rejectModerationCheck(id, reason = 'Rejected by admin') {
  const row = db.prepare('SELECT * FROM content_moderation_checks WHERE id = ?').get(id);
  if (!row) return null;
  const updated = updateContentModerationCheck(id, {
    decision: 'block',
    reason,
    providerDecision: row.provider_decision || 'deny',
  });
  if (row.subject_type === 'generated_image' && row.subject_id) {
    rejectHistory(row.subject_id);
  }
  return updated ? rowToModerationItem(db.prepare('SELECT * FROM content_moderation_checks WHERE id = ?').get(id)) : null;
}

// Generation History (admin: show all generated images, delete on demand)
export function listGenHistoryForModeration({ category = '', search = '', status = 'pending', limit = 60, offset = 0 }) {
  const where = [
    "TRIM(COALESCE(image_url, '')) != ''",
    "image_url NOT LIKE 'data:%'",
    "LOWER(image_url) NOT LIKE 'http://%'",
  ];
  const params = { limit: Math.max(1, Math.min(100, Number(limit))), offset: Math.max(0, Number(offset)), status: String(status || 'pending') };
  LEGACY_BLOCKED_IMAGE_HOSTS.forEach((host, index) => {
    const key = `blockedHost${index}`;
    where.push(`LOWER(image_url) NOT LIKE @${key}`);
    params[key] = `%${host}%`;
  });
  if (status && status !== 'All') {
    where.push('moderation_status = @status');
  }
  if (category && category !== 'All') {
    where.push('category = @category');
    params.category = category;
  }
  if (search && String(search).trim()) {
    where.push('(LOWER(prompt) LIKE @q OR LOWER(prompt_zh) LIKE @q OR LOWER(image_url) LIKE @q)');
    params.q = `%${String(search).toLowerCase()}%`;
  }

  const sql = `SELECT gh.* FROM gen_history gh ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY gh.created_at DESC LIMIT @limit OFFSET @offset`;
  const rows = db.prepare(sql).all(params).map(rowToHistory).filter(item => item.imageUrl && item.imageUrl !== '/image-placeholder.svg');
  const totalParams = { ...params };
  delete totalParams.limit;
  delete totalParams.offset;
  const totalWhere = where.filter(w => !w.includes('@limit') && !w.includes('@offset'));
  const totalSql = `SELECT COUNT(1) AS c FROM gen_history gh ${totalWhere.length ? `WHERE ${totalWhere.join(' AND ')}` : ''}`;
  const total = db.prepare(totalSql).get(totalParams)?.c || 0;
  return { items: rows, total };
}

export function deleteHistory(id) {
  // Look up the image URL before deleting so we can clean up the local file.
  const row = db.prepare('SELECT image_url FROM gen_history WHERE id = ?').get(id);
  if (row) {
    const url = String(row.image_url || '');
    // Only delete files we actually host; skip CDN URLs and base64 data.
    if (url.startsWith('/uploads/')) {
      const filePath = join(GENERATED_UPLOADS_DIR, url.replace('/uploads/generated/', ''));
      try { if (existsSync(filePath)) unlinkSync(filePath); } catch { /* file already gone */ }
    }
  }
  db.prepare('DELETE FROM prompts WHERE id = ?').run(`gen-${id}`);
  db.prepare('DELETE FROM generated_images WHERE id = ?').run(id);
  db.prepare('DELETE FROM gen_history WHERE id = ?').run(id);
}

// Generation Jobs Queue
export function enqueueGenJob({
  userId,
  mode = 'text',
  model,
  size,
  quality,
  generationOptions = {},
  prompt,
  negativePrompt = '',
  referenceImageUrl = null,
  editStrength = null,
  maxAttempts = 3,
  publishToPrompts = true,
  initialStatus = 'queued',
  sourceChannel = '',
  providerName = '',
  isHeartbeat = false,
  heartbeatRunId = '',
  heartbeatKind = '',
  heartbeatCategory = '',
  category = '',
  preferredChannel = '',
  priority = 0,
}) {
  const status = String(initialStatus || 'queued');
  const normalizedGenerationOptions = generationOptions && typeof generationOptions === 'object'
    ? generationOptions
    : {};
  const forceNew = Boolean(normalizedGenerationOptions.forceNew || normalizedGenerationOptions.allowDuplicate);
  const dedupKey = createHash('sha256')
    .update(JSON.stringify({
      prompt: normalizePromptFingerprint(prompt),
      mode: String(mode || 'text'),
      model: String(model || ''),
      size: String(size || ''),
      quality: String(quality || ''),
      negativePrompt: normalizePromptFingerprint(negativePrompt),
      referenceImageUrl: normalizeImageFingerprint(referenceImageUrl),
      aspectRatio: String(normalizedGenerationOptions.aspectRatio || ''),
    }))
    .digest('hex');

  // A double click, retrying browser request, or duplicated internal enqueue
  // must not create two identical in-flight generations or charge twice.
  if (!isHeartbeat && !forceNew) {
    const existing = db.prepare(`
      SELECT *
      FROM gen_jobs
      WHERE dedup_key = ?
        AND user_id IS ?
        AND status IN ('queued', 'running', 'fast_running')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(dedupKey, userId || null);
    if (existing) return rowToGenJob(existing);
  }

  const id = randomUUID();
  const now = nowIso();
  const isRunningLike = status === 'running' || status === 'fast_running';
  const initialAttemptCount = isRunningLike ? 1 : 0;
  const startedAt = isRunningLike ? now : null;
  const jobPriority = Math.max(0, Number(priority) || 0);

  const tx = db.transaction(() => {
    // Credit deduction:
    // - null userId (anonymous): no deduction — unlimited free generations by design.
    // - valid userId but no balance record: tryDeductCredit returns false → blocked.
    // - valid userId with balance: deducts the first available credit type atomically.
    if (userId) {
      // Keep legacy accounts consistent with the billing endpoint before charging.
      ensureUserBalance(userId, CREDITS_PER_IMAGE * 3);
      const deducted = tryDeductCredit(userId);
      if (!deducted) throw new Error('INSUFFICIENT_CREDITS');
    }

    db.prepare(`
      INSERT INTO gen_jobs (
        id, user_id, mode, model, size, quality, generation_options_json, prompt, negative_prompt,
        reference_image_url, edit_strength, dedup_key, category, publish_to_prompts, status, attempt_count, max_attempts, queued_at, next_retry_at,
        last_error, result_image_url, source_channel, provider_name, latency_ms, is_heartbeat,
        heartbeat_run_id, heartbeat_kind, heartbeat_category, preferred_channel, priority,
        created_at, updated_at, started_at, finished_at
      ) VALUES (
        @id, @userId, @mode, @model, @size, @quality, @generationOptionsJson, @prompt, @negativePrompt,
        @referenceImageUrl, @editStrength, @dedupKey, @category, @publishToPrompts, @status, @attemptCount, @maxAttempts, @queuedAt, @nextRetryAt,
        @lastError, @resultImageUrl, @sourceChannel, @providerName, @latencyMs, @isHeartbeat,
        @heartbeatRunId, @heartbeatKind, @heartbeatCategory, @preferredChannel, @priority,
        @createdAt, @updatedAt, @startedAt, @finishedAt
      )
    `).run({
      id,
      userId: userId || null,
      mode,
      model,
      size,
      quality,
      generationOptionsJson: JSON.stringify(normalizedGenerationOptions),
      prompt,
      negativePrompt,
      referenceImageUrl,
      editStrength: editStrength ?? null,
      dedupKey,
      category: normalizeGenerationCategory(category) || '',
      publishToPrompts: publishToPrompts ? 1 : 0,
      status,
      attemptCount: initialAttemptCount,
      maxAttempts: Number(maxAttempts || 3),
      queuedAt: now,
      nextRetryAt: now,
      lastError: '',
      resultImageUrl: '',
      sourceChannel: sourceChannel || '',
      providerName: providerName || '',
      latencyMs: 0,
      isHeartbeat: isHeartbeat ? 1 : 0,
      heartbeatRunId: heartbeatRunId || '',
      heartbeatKind: heartbeatKind || '',
      heartbeatCategory: heartbeatCategory || '',
      preferredChannel: preferredChannel || '',
      priority: jobPriority,
      createdAt: now,
      updatedAt: now,
      startedAt,
      finishedAt: null,
    });
  });

  tx();
  return getGenJobById(id);
}

export function getGenJobById(id) {
  const row = db.prepare('SELECT * FROM gen_jobs WHERE id = ?').get(id);
  return row ? rowToGenJob(row) : null;
}

export function listGenJobs({ status, userId, limit = 50 }) {
  const where = [];
  const params = { limit: Math.max(1, Math.min(500, Number(limit || 50))) };
  if (status) {
    where.push('status = @status');
    params.status = status;
  }
  if (userId) {
    where.push('user_id = @userId');
    params.userId = userId;
  }
  const sql = `
    SELECT * FROM gen_jobs
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY queued_at DESC, created_at DESC
    LIMIT @limit
  `;
  return db.prepare(sql).all(params).map(rowToGenJob);
}

export function claimNextGenJob() {
  const now = nowIso();
  try {
    const tx = db.transaction(() => {
      const row = db.prepare(`
        SELECT * FROM gen_jobs
        WHERE status = 'queued'
          AND (next_retry_at IS NULL OR next_retry_at <= ?)
        ORDER BY priority DESC, queued_at ASC, created_at ASC
        LIMIT 1
      `).get(now);
      if (!row) return null;

      const res = db.prepare(`
        UPDATE gen_jobs
        SET status = 'running',
            attempt_count = attempt_count + 1,
            started_at = ?,
            updated_at = ?
        WHERE id = ? AND status = 'queued'
      `).run(now, now, row.id);

      if (res.changes !== 1) return null;
      return getGenJobById(row.id);
    });

    return tx();
  } catch (e) {
    if (e?.code === 'SQLITE_BUSY') return null;
    throw e;
  }
}

export function reclaimStaleGenJobs({ staleAfterMs = 15 * 60 * 1000 } = {}) {
  const cutoff = new Date(Date.now() - staleAfterMs).toISOString();
  const now = nowIso();
  try {
    const res = db.prepare(`
    UPDATE gen_jobs
    SET status = 'queued',
        next_retry_at = ?,
        last_error = CASE
          WHEN last_error IS NULL OR last_error = '' THEN 'reclaimed stale running job'
          ELSE last_error
        END,
        updated_at = ?
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < ?
  `).run(now, now, cutoff);
    return res.changes;
  } catch (e) {
    // SQLITE_BUSY can occur if the DB is locked; log and continue
    console.warn('[reclaimStaleGenJobs] DB busy, skipping this cycle:', e.code);
    return 0;
  }
}

export function markGenJobSucceeded(id, resultImageUrl, options = {}) {
  const now = nowIso();
  const sourceChannel = String(options.sourceChannel || '').slice(0, 120);
  const providerName = String(options.providerName || '').slice(0, 120);
  const latencyMs = Math.max(0, Number(options.latencyMs || 0));
  try {
    db.prepare(`
      UPDATE gen_jobs
      SET status = 'succeeded',
          result_image_url = ?,
          source_channel = CASE WHEN ? != '' THEN ? ELSE source_channel END,
          provider_name = CASE WHEN ? != '' THEN ? ELSE provider_name END,
          latency_ms = CASE WHEN ? > 0 THEN ? ELSE latency_ms END,
          last_error = '',
          finished_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      resultImageUrl,
      sourceChannel,
      sourceChannel,
      providerName,
      providerName,
      latencyMs,
      latencyMs,
      now,
      now,
      id,
    );
    return getGenJobById(id);
  } catch (e) {
    if (e?.code === 'SQLITE_BUSY') return null;
    throw e;
  }
}

export function markGenJobFailed(id, errorMessage, options = {}) {
  const now = nowIso();
  try {
    const row = db.prepare('SELECT attempt_count, max_attempts FROM gen_jobs WHERE id = ?').get(id);
    if (!row) return null;
    const message = String(errorMessage || '').slice(0, 2000);
    const isRateLimit = /429|rate limit|concurrency limit/i.test(message);
    const isUpstream = /502|upstream request failed|upstream_error/i.test(message);
    const explicitRetryDelayMs = Number(options.retryDelayMs || 0);
    const sourceChannel = String(options.sourceChannel || '').slice(0, 120);
    const providerName = String(options.providerName || '').slice(0, 120);
    const latencyMs = Math.max(0, Number(options.latencyMs || 0));

    if (row.attempt_count < row.max_attempts) {
      let backoffMs;
      if (Number.isFinite(explicitRetryDelayMs) && explicitRetryDelayMs > 0) {
        backoffMs = explicitRetryDelayMs;
      } else if (isRateLimit) {
        backoffMs = Math.min(600_000, 30_000 * Math.pow(3, row.attempt_count - 1));
      } else if (isUpstream) {
        backoffMs = Math.min(300_000, 15_000 * Math.pow(3, row.attempt_count - 1));
      } else {
        backoffMs = Math.min(180_000, 10_000 * Math.pow(3, row.attempt_count - 1));
      }
      const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
      db.prepare(`
        UPDATE gen_jobs
        SET status = 'queued',
            queued_at = ?,
            next_retry_at = ?,
            last_error = ?,
            source_channel = CASE WHEN ? != '' THEN ? ELSE source_channel END,
            provider_name = CASE WHEN ? != '' THEN ? ELSE provider_name END,
            latency_ms = CASE WHEN ? > 0 THEN ? ELSE latency_ms END,
            updated_at = ?
        WHERE id = ?
      `).run(
        now,
        nextRetryAt,
        message,
        sourceChannel,
        sourceChannel,
        providerName,
        providerName,
        latencyMs,
        latencyMs,
        now,
        id,
      );
    } else {
      db.prepare(`
        UPDATE gen_jobs
        SET status = 'failed',
            last_error = ?,
            source_channel = CASE WHEN ? != '' THEN ? ELSE source_channel END,
            provider_name = CASE WHEN ? != '' THEN ? ELSE provider_name END,
            latency_ms = CASE WHEN ? > 0 THEN ? ELSE latency_ms END,
            finished_at = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        message,
        sourceChannel,
        sourceChannel,
        providerName,
        providerName,
        latencyMs,
        latencyMs,
        now,
        now,
        id,
      );
    }

    return getGenJobById(id);
  } catch (e) {
    if (e?.code === 'SQLITE_BUSY') return null;
    throw e;
  }
}

export function requeueGenJob(id) {
  const now = nowIso();
  db.prepare(`
    UPDATE gen_jobs
    SET status = 'queued',
        queued_at = ?,
        next_retry_at = ?,
        last_error = '',
        updated_at = ?
    WHERE id = ?
  `).run(now, now, now, id);
  return getGenJobById(id);
}

export function cancelGenJob(id) {
  const now = nowIso();
  const res = db.prepare(`
    UPDATE gen_jobs
    SET status = 'cancelled',
        last_error = 'Cancelled by user',
        finished_at = ?,
        updated_at = ?
    WHERE id = ? AND status IN ('queued', 'running', 'fast_running')
  `).run(now, now, id);
  return res.changes > 0 ? getGenJobById(id) : null;
}

// Content Moderation Checks
export function createContentModerationCheck({
  requestType = 'prompt',
  subjectType = 'prompt',
  subjectId = '',
  textContent = '',
  imageUrl = '',
  sourcePrompt = '',
  providerName = '',
  providerDecision = 'allow',
  decision = 'pass',
  score = 0,
  reason = '',
  labels = [],
  raw = {},
}) {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO content_moderation_checks (
      id, request_type, subject_type, subject_id, text_content, image_url, source_prompt,
      provider_name, provider_decision, decision, score, reason, labels_json, raw_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(requestType || 'prompt'),
    String(subjectType || 'prompt'),
    String(subjectId || ''),
    String(textContent || ''),
    String(imageUrl || ''),
    String(sourcePrompt || ''),
    String(providerName || ''),
    String(providerDecision || 'allow'),
    String(decision || 'pass'),
    Number.isFinite(Number(score)) ? Number(score) : 0,
    String(reason || ''),
    JSON.stringify(Array.isArray(labels) ? labels : []),
    JSON.stringify(raw && typeof raw === 'object' ? raw : {}),
    now,
    now,
  );
  return getContentModerationCheckById(id);
}

export function getContentModerationCheckById(id) {
  const row = db.prepare('SELECT * FROM content_moderation_checks WHERE id = ?').get(id);
  return row ? rowToContentModerationCheck(row) : null;
}

export function listContentModerationChecks({ requestType = '', subjectType = '', decision = '', limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit || 50))),
    offset: Math.max(0, Number(offset || 0)),
  };
  if (requestType) {
    where.push('request_type = @requestType');
    params.requestType = requestType;
  }
  if (subjectType) {
    where.push('subject_type = @subjectType');
    params.subjectType = subjectType;
  }
  if (decision) {
    where.push('decision = @decision');
    params.decision = decision;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM content_moderation_checks
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `).all(params).map(rowToContentModerationCheck);
  const total = db.prepare(`
    SELECT COUNT(1) AS c FROM content_moderation_checks
    ${whereSql}
  `).get(params)?.c || 0;
  return { items: rows, total };
}

export function updateContentModerationCheck(id, updates = {}) {
  const sets = [];
  const params = { id, updatedAt: nowIso() };
  if ('decision' in updates) {
    sets.push('decision = @decision');
    params.decision = String(updates.decision || 'pass');
  }
  if ('reason' in updates) {
    sets.push('reason = @reason');
    params.reason = String(updates.reason || '');
  }
  if ('providerDecision' in updates) {
    sets.push('provider_decision = @providerDecision');
    params.providerDecision = String(updates.providerDecision || 'allow');
  }
  if ('labels' in updates) {
    sets.push('labels_json = @labelsJson');
    params.labelsJson = JSON.stringify(Array.isArray(updates.labels) ? updates.labels : []);
  }
  if ('raw' in updates) {
    sets.push('raw_json = @rawJson');
    params.rawJson = JSON.stringify(updates.raw && typeof updates.raw === 'object' ? updates.raw : {});
  }
  if ('score' in updates) {
    sets.push('score = @score');
    params.score = Number.isFinite(Number(updates.score)) ? Number(updates.score) : 0;
  }
  if (sets.length === 0) return getContentModerationCheckById(id);
  sets.push('updated_at = @updatedAt');
  db.prepare(`UPDATE content_moderation_checks SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getContentModerationCheckById(id);
}

// Generated Images
function rowToGalleryImage(row) {
  const sourcePrompt = String(row.prompt || row.source_prompt || '').trim();
  const fallback = inferCategoryAndTags(sourcePrompt);
  const parsedTags = safeParseTags(row.tags_json || '[]');
  const finalCategory = row.category || fallback.category || 'Generated';
  const safeImageUrl = normalizePublicImageUrl(row.image_url);
  return {
    id: row.id,
    imageUrl: safeImageUrl,
    prompt: sourcePrompt,
    promptZh: String(row.prompt_zh || '').trim(),
    author: {
      name: row.author_name || 'Lovioa',
      avatar: row.author_avatar || 'https://api.dicebear.com/7.x/miniavs/svg?seed=pf',
      promptCount: 0,
      userId: row.author_user_id || null,
    },
    tags: parsedTags.length ? parsedTags : fallback.tags,
    category: finalCategory,
    likes: Number(row.likes || 0),
    liked: !!row.liked,
    saved: !!row.saved,
    createdAt: row.created_at,
  };
}

export function listGeneratedImages({ category, search, limit = 300 }) {
  const params = { limit: Math.max(1, Math.min(300, Number(limit || 300))) };
  const sourceLimit = Math.min(2000, Math.max(params.limit * 4, params.limit));

  const where = [];
  const historyWhere = [];

  if (category && category !== 'Latest' && category !== 'Popular' && category !== 'Generated') {
    where.push('category = @category');
    historyWhere.push('category = @category');
    params.category = category;
  }
  if (search && String(search).trim()) {
    const q = `%${String(search).toLowerCase()}%`;
    where.push('(LOWER(source_prompt) LIKE @q OR LOWER(tags_json) LIKE @q OR LOWER(category) LIKE @q OR LOWER(author_name) LIKE @q)');
    historyWhere.push('(LOWER(prompt) LIKE @q OR LOWER(prompt_zh) LIKE @q OR LOWER(image_url) LIKE @q)');
    params.q = q;
  }
  historyWhere.push('NOT EXISTS (SELECT 1 FROM generated_images g2 WHERE g2.id = gen_history.id)');
  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const historyWhereStr = `WHERE ${historyWhere.join(' AND ')}`;

  // generated_images is the canonical gallery source. History is only included
  // when its row has not been materialized there yet.
  const sql = `
    SELECT * FROM (
      SELECT
        id,
        image_url,
        prompt_zh,
        source_prompt AS prompt,
        model,
        category,
        tags_json,
        author_name,
        author_avatar,
        author_user_id,
        likes,
        liked,
        saved,
        created_at
      FROM generated_images
      ${whereStr}
      UNION ALL
      SELECT
        id,
        image_url,
        '' AS prompt_zh,
        prompt,
        model,
        category,
        '[]' AS tags_json,
        'Lovioa' AS author_name,
        'https://api.dicebear.com/7.x/miniavs/svg?seed=pf' AS author_avatar,
        user_id AS author_user_id,
        0 AS likes,
        0 AS liked,
        0 AS saved,
        created_at
      FROM gen_history
      ${historyWhereStr}
    ) combined
    ORDER BY created_at DESC
    LIMIT @sourceLimit
  `;

  const rows = db.prepare(sql).all({ ...params, sourceLimit }).map(rowToGalleryImage);
  const byId = new Map();
  const byImage = new Set();
  const byPrompt = new Set();
  for (const item of rows) {
    const imageKey = normalizeImageFingerprint(item.imageUrl);
    const promptKey = normalizePromptFingerprint(item.prompt);
    if (byId.has(item.id)) continue;
    if (imageKey && byImage.has(imageKey)) continue;
    if (promptKey && byPrompt.has(promptKey)) continue;
    byId.set(item.id, item);
    if (imageKey) byImage.add(imageKey);
    if (promptKey) byPrompt.add(promptKey);
    if (byId.size >= params.limit) break;
  }
  return [...byId.values()];
}

// ── Update Prompt ───────────────────────────────────────────────────────────
export function updatePrompt(id, updates) {
  const existing = getPromptById(id);
  if (!existing) return null;

  const nextPrompt = 'prompt' in updates ? String(updates.prompt || '') : existing.prompt;
  const nextTags = 'tags' in updates
    ? (Array.isArray(updates.tags) ? updates.tags.filter(Boolean).slice(0, 8) : [])
    : (Array.isArray(existing.tags) ? existing.tags : []);
  const manualCategory = 'category' in updates ? updates.category : existing.category;
  const normalizedCategory = normalizeCategoryFromContent({
    promptText: nextPrompt,
    tags: nextTags,
    manualCategory,
  });

  const sets = [];
  const params = {};
  if ('imageUrl' in updates) { sets.push('image_url = @imageUrl'); params.imageUrl = materializeDataUrlIfNeeded(updates.imageUrl, 'prompt'); }
  if ('prompt' in updates) { sets.push('prompt = @prompt'); params.prompt = updates.prompt; }
  if ('tags' in updates) { sets.push('tags_json = @tagsJson'); params.tagsJson = JSON.stringify(nextTags); }
  if ('prompt' in updates || 'tags' in updates || 'category' in updates) {
    sets.push('category = @category');
    params.category = normalizedCategory;
  }
  if (sets.length === 0) return getPromptById(id);
  params.id = id;

  const tx = db.transaction(() => {
    db.prepare(`UPDATE prompts SET ${sets.join(', ')} WHERE id = @id`).run(params);
    if ('tags' in updates) {
      replacePromptTagRelations(id, nextTags, { source: 'manual', confidence: 1 });
    }
  });
  tx();

  return getPromptById(id);
}

// ── Admin ───────────────────────────────────────────────────────────────────
export function listUsers({ limit = 50, offset = 0, sort = 'newest' } = {}) {
  const orderMap = {
    newest: 'u.created_at DESC',
    oldest: 'u.created_at ASC',
    prompts_desc: 'prompt_count DESC, u.created_at DESC',
    name_asc: 'u.username ASC',
  };
  const orderBy = orderMap[sort] || orderMap.newest;

  const users = db.prepare(`
    SELECT u.*, COUNT(p.id) AS prompt_count
    FROM users u
    LEFT JOIN prompts p ON p.author_user_id = u.id
    GROUP BY u.id
    ORDER BY ${orderBy}
    LIMIT @limit OFFSET @offset
  `).all({ limit: Math.max(1, Math.min(500, Number(limit))), offset: Math.max(0, Number(offset)) });

  const total = db.prepare('SELECT COUNT(1) AS c FROM users').get().c;

  return {
    users: users.map(row => rowToUser(row, { promptCount: row.prompt_count })),
    total,
  };
}

// Admin: list all prompts with sort and category filter
export function listPromptsAdmin({ limit = 50, offset = 0, sort = 'newest', category = '' } = {}) {
  const orderMap = {
    newest: 'p.created_at DESC',
    oldest: 'p.created_at ASC',
    likes_desc: 'p.likes DESC, p.created_at DESC',
  };
  const orderBy = orderMap[sort] || orderMap.newest;
  const where = [];
  const params = {
    limit: Math.max(1, Math.min(500, Number(limit))),
    offset: Math.max(0, Number(offset)),
  };
  if (category && category !== 'Latest' && category !== 'Popular') {
    where.push('p.category = @category');
    params.category = category;
  }
  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT p.* FROM prompts p ${whereStr} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`;
  const rows = db.prepare(sql).all(params);
  const total = db.prepare(`SELECT COUNT(1) AS c FROM prompts p ${whereStr}`).get(params).c;
  return { prompts: rows.map(rowToPrompt), total };
}

// Admin: list all generation jobs with optional status filter
export function listGenJobsAdmin({ status = '', limit = 50, offset = 0 } = {}) {
  const params = {
    limit: Math.max(1, Math.min(500, Number(limit))),
    offset: Math.max(0, Number(offset)),
  };
  let whereStr = '';
  if (status && ['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(status)) {
    whereStr = 'WHERE j.status = @status';
    params.status = status;
  }
  const jobs = db.prepare(`
    SELECT j.*, u.username AS user_username, u.avatar AS user_avatar
    FROM gen_jobs j
    LEFT JOIN users u ON u.id = j.user_id
    ${whereStr}
    ORDER BY j.created_at DESC
    LIMIT @limit OFFSET @offset
  `).all(params);
  const countParams = status ? { status } : {};
  const total = status
    ? db.prepare(`SELECT COUNT(1) AS c FROM gen_jobs WHERE status = @status`).get(countParams).c
    : db.prepare('SELECT COUNT(1) AS c FROM gen_jobs').get().c;
  return {
    jobs: jobs.map(j => ({ ...rowToGenJob(j), userUsername: j.user_username, userAvatar: j.user_avatar })),
    total,
  };
}

export function createHeartbeatRun({
  kind = 'api_stability',
  plannedJobs = 0,
  generatedCategories = [],
  details = {},
} = {}) {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO heartbeat_runs (
      id, kind, status, planned_jobs, queued_jobs, succeeded_jobs, failed_jobs,
      generated_categories_json, details_json, started_at, finished_at, created_at, updated_at
    ) VALUES (?, ?, 'running', ?, 0, 0, 0, ?, ?, ?, NULL, ?, ?)
  `).run(
    id,
    String(kind || 'api_stability'),
    Math.max(0, Number(plannedJobs || 0)),
    JSON.stringify(Array.isArray(generatedCategories) ? generatedCategories : []),
    JSON.stringify(details || {}),
    now,
    now,
    now,
  );
  return getHeartbeatRunById(id);
}

export function getHeartbeatRunById(id) {
  const row = db.prepare('SELECT * FROM heartbeat_runs WHERE id = ?').get(id);
  return row ? rowToHeartbeatRun(row) : null;
}

export function touchHeartbeatRun(id, updates = {}) {
  const sets = [];
  const params = { id, updatedAt: nowIso() };
  if ('status' in updates) {
    sets.push('status = @status');
    params.status = String(updates.status || 'running');
  }
  if ('plannedJobs' in updates) {
    sets.push('planned_jobs = @plannedJobs');
    params.plannedJobs = Math.max(0, Number(updates.plannedJobs || 0));
  }
  if ('queuedJobs' in updates) {
    sets.push('queued_jobs = @queuedJobs');
    params.queuedJobs = Math.max(0, Number(updates.queuedJobs || 0));
  }
  if ('succeededJobs' in updates) {
    sets.push('succeeded_jobs = @succeededJobs');
    params.succeededJobs = Math.max(0, Number(updates.succeededJobs || 0));
  }
  if ('failedJobs' in updates) {
    sets.push('failed_jobs = @failedJobs');
    params.failedJobs = Math.max(0, Number(updates.failedJobs || 0));
  }
  if ('generatedCategories' in updates) {
    sets.push('generated_categories_json = @generatedCategoriesJson');
    params.generatedCategoriesJson = JSON.stringify(Array.isArray(updates.generatedCategories) ? updates.generatedCategories : []);
  }
  if ('details' in updates) {
    sets.push('details_json = @detailsJson');
    params.detailsJson = JSON.stringify(updates.details || {});
  }
  if ('finishedAt' in updates) {
    sets.push('finished_at = @finishedAt');
    params.finishedAt = updates.finishedAt || null;
  }
  if (sets.length === 0) return getHeartbeatRunById(id);
  sets.push('updated_at = @updatedAt');
  db.prepare(`UPDATE heartbeat_runs SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getHeartbeatRunById(id);
}

export function listHeartbeatRuns({ limit = 30, offset = 0, status = '' } = {}) {
  const params = {
    limit: Math.max(1, Math.min(200, Number(limit || 30))),
    offset: Math.max(0, Number(offset || 0)),
  };
  const where = [];
  if (status) {
    where.push('status = @status');
    params.status = String(status);
  }
  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT * FROM heartbeat_runs
    ${whereStr}
    ORDER BY created_at DESC
    LIMIT @limit OFFSET @offset
  `).all(params).map(rowToHeartbeatRun);
  const countSql = `SELECT COUNT(1) AS c FROM heartbeat_runs ${whereStr}`;
  const total = db.prepare(countSql).get(params)?.c || 0;
  return { runs: rows, total };
}

export function summarizeHeartbeatRunJobs(runId) {
  const row = db.prepare(`
    SELECT
      COUNT(1) AS total,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
      SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
    FROM gen_jobs
    WHERE is_heartbeat = 1
      AND heartbeat_run_id = ?
  `).get(runId) || {};
  return {
    total: Number(row.total || 0),
    queued: Number(row.queued || 0),
    running: Number(row.running || 0),
    succeeded: Number(row.succeeded || 0),
    failed: Number(row.failed || 0),
    cancelled: Number(row.cancelled || 0),
  };
}

export function refreshHeartbeatRunFromJobs(runId) {
  const summary = summarizeHeartbeatRunJobs(runId);
  const isDone = summary.queued === 0 && summary.running === 0;
  const status = isDone ? 'completed' : 'running';
  const finishedAt = isDone ? nowIso() : null;
  return touchHeartbeatRun(runId, {
    queuedJobs: summary.total,
    succeededJobs: summary.succeeded,
    failedJobs: summary.failed + summary.cancelled,
    status,
    ...(finishedAt ? { finishedAt } : {}),
  });
}

function normalizeFailureReason(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'unknown_error';
  const lower = text.toLowerCase();
  if (lower.includes('timeout') || lower.includes('abort')) return 'timeout_or_abort';
  if (lower.includes('rate') && lower.includes('limit')) return 'rate_limited';
  if (lower.includes('insufficient_credits') || lower.includes('credits')) return 'insufficient_credits';
  if (lower.includes('moderation')) return 'moderation_blocked';
  if (lower.includes('http 5')) return 'upstream_5xx';
  if (lower.includes('http 4')) return 'upstream_4xx';
  if (lower.includes('empty image') || lower.includes('empty result')) return 'empty_result';
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connect')) return 'network_error';
  return 'other_error';
}

export function getHeartbeatStats({
  sinceHours = 24,
  expectedChannels = [],
  successRateWarn = 85,
  p90LatencyWarnMs = 90000,
  failedCountWarn = 5,
  minSamplesForAlert = 5,
} = {}) {
  const hours = Math.max(1, Math.min(24 * 30, Number(sinceHours || 24)));
  const since = new Date(Date.now() - (hours * 60 * 60 * 1000)).toISOString();
  const channelExpr = "COALESCE(NULLIF(source_channel, ''), NULLIF(provider_name, ''), 'unknown')";
  const rows = db.prepare(`
    SELECT
      ${channelExpr} AS channel,
      COUNT(1) AS total,
      SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      ROUND(AVG(CASE WHEN latency_ms > 0 THEN latency_ms END), 0) AS avg_latency_ms,
      MAX(latency_ms) AS max_latency_ms
    FROM gen_jobs
    WHERE is_heartbeat = 1
      AND created_at >= ?
    GROUP BY channel
    ORDER BY total DESC, channel ASC
  `).all(since);

  const p50Stmt = db.prepare(`
    SELECT latency_ms
    FROM gen_jobs
    WHERE is_heartbeat = 1
      AND created_at >= ?
      AND ${channelExpr} = ?
      AND latency_ms > 0
    ORDER BY latency_ms ASC
  `);

  const channels = rows.map((r) => {
    const total = Number(r.total || 0);
    const succeeded = Number(r.succeeded || 0);
    const failed = Number(r.failed || 0);
    const successRate = total > 0 ? Number(((succeeded / total) * 100).toFixed(2)) : 0;
    const latencyRows = p50Stmt.all(since, r.channel);
    const values = latencyRows.map((x) => Number(x.latency_ms || 0)).filter((n) => n > 0);
    const p50 = values.length ? values[Math.floor((values.length - 1) * 0.5)] : 0;
    const p90 = values.length ? values[Math.floor((values.length - 1) * 0.9)] : 0;
    return {
      channel: r.channel,
      total,
      succeeded,
      failed,
      successRate,
      avgLatencyMs: Number(r.avg_latency_ms || 0),
      maxLatencyMs: Number(r.max_latency_ms || 0),
      p50LatencyMs: Number(p50 || 0),
      p90LatencyMs: Number(p90 || 0),
    };
  });

  const channelMap = new Map(channels.map((c) => [String(c.channel || ''), c]));
  const normalizedExpected = Array.isArray(expectedChannels)
    ? [...new Set(expectedChannels.map((x) => String(x || '').trim()).filter(Boolean))]
    : [];
  for (const name of normalizedExpected) {
    if (channelMap.has(name)) continue;
    channelMap.set(name, {
      channel: name,
      total: 0,
      succeeded: 0,
      failed: 0,
      successRate: 0,
      avgLatencyMs: 0,
      maxLatencyMs: 0,
      p50LatencyMs: 0,
      p90LatencyMs: 0,
    });
  }
  const mergedChannelsRaw = [...channelMap.values()]
    .sort((a, b) => b.total - a.total || a.channel.localeCompare(b.channel));

  const overview = db.prepare(`
    SELECT
      COUNT(1) AS total,
      SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running
    FROM gen_jobs
    WHERE is_heartbeat = 1
      AND created_at >= ?
  `).get(since) || {};

  const failureRows = db.prepare(`
    SELECT id, ${channelExpr} AS channel, last_error, updated_at
    FROM gen_jobs
    WHERE is_heartbeat = 1
      AND status = 'failed'
      AND created_at >= ?
  `).all(since);

  const sortedRecentErrors = failureRows
    .slice()
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
    .slice(0, 20)
    .map((r) => ({
    id: r.id,
    channel: r.channel || 'unknown',
    lastError: r.last_error || '',
    updatedAt: r.updated_at,
  }));

  const failureReasonsMap = new Map();
  for (const row of failureRows) {
    const reason = normalizeFailureReason(row.last_error);
    failureReasonsMap.set(reason, (failureReasonsMap.get(reason) || 0) + 1);
  }
  const failureReasons = [...failureReasonsMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, 12);

  const minSamples = Math.max(1, Number(minSamplesForAlert || 5));
  const successWarn = Math.max(1, Math.min(100, Number(successRateWarn || 85)));
  const p90Warn = Math.max(1, Number(p90LatencyWarnMs || 90000));
  const failWarn = Math.max(1, Number(failedCountWarn || 5));

  const mergedChannels = mergedChannelsRaw.map((row) => {
    const issues = [];
    const total = Number(row.total || 0);
    const failed = Number(row.failed || 0);
    const successRate = Number(row.successRate || 0);
    const p90 = Number(row.p90LatencyMs || 0);
    if (total >= minSamples && successRate < successWarn) {
      issues.push(`success_rate_below_${successWarn}`);
    }
    if (total >= minSamples && p90 > p90Warn) {
      issues.push(`p90_latency_above_${p90Warn}`);
    }
    if (failed >= failWarn) {
      issues.push(`failed_count_above_${failWarn}`);
    }
    const alertLevel = issues.length >= 2 ? 'critical' : (issues.length === 1 ? 'warning' : 'ok');
    return { ...row, alertLevel, alertIssues: issues };
  });

  const activeChannels = mergedChannels.filter((c) => Number(c.total || 0) > 0).map((c) => c.channel);
  const inactiveChannels = normalizedExpected.filter((ch) => !activeChannels.includes(ch));
  const coverage = {
    expected: normalizedExpected.length,
    active: activeChannels.length,
    inactive: inactiveChannels.length,
    activeChannels,
    inactiveChannels,
    activeRate: normalizedExpected.length > 0
      ? Number(((activeChannels.length / normalizedExpected.length) * 100).toFixed(1))
      : 100,
  };

  const alertSummary = {
    critical: mergedChannels.filter((c) => c.alertLevel === 'critical').length,
    warning: mergedChannels.filter((c) => c.alertLevel === 'warning').length,
    ok: mergedChannels.filter((c) => c.alertLevel === 'ok').length,
    thresholds: {
      successRateWarn: successWarn,
      p90LatencyWarnMs: p90Warn,
      failedCountWarn: failWarn,
      minSamplesForAlert: minSamples,
    },
  };

  return {
    since,
    sinceHours: hours,
    overview: {
      total: Number(overview.total || 0),
      succeeded: Number(overview.succeeded || 0),
      failed: Number(overview.failed || 0),
      queued: Number(overview.queued || 0),
      running: Number(overview.running || 0),
    },
    channels: mergedChannels,
    recentErrors: sortedRecentErrors,
    failureReasons,
    coverage,
    alertSummary,
  };
}

// Admin: log an action
export function logAdminAction({ adminUserId, adminUsername, action, targetUserId = null, targetUsername = null, targetPromptId = null, details = {} }) {
  const id = randomUUID();
  db.prepare(`
    INSERT INTO gen_admin_logs (id, admin_user_id, admin_username, action, target_user_id, target_username, target_prompt_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, adminUserId, adminUsername, action, targetUserId, targetUsername, targetPromptId, JSON.stringify(details), nowIso());
  return rowToAdminLog(db.prepare('SELECT * FROM gen_admin_logs WHERE id = ?').get(id));
}

export function listAdminLogs({ limit = 50, offset = 0 } = {}) {
  const logs = db.prepare('SELECT * FROM gen_admin_logs ORDER BY created_at DESC LIMIT @limit OFFSET @offset')
    .all({ limit: Math.max(1, Math.min(500, Number(limit))), offset: Math.max(0, Number(offset)) });
  const total = db.prepare('SELECT COUNT(1) AS c FROM gen_admin_logs').get().c;
  return { logs: logs.map(rowToAdminLog), total };
}

function rowToAdminLog(row) {
  let details = {};
  try { details = JSON.parse(row.details || '{}'); } catch { /* ignore corrupted JSON */ }
  return {
    id: row.id,
    adminUserId: row.admin_user_id,
    adminUsername: row.admin_username,
    action: row.action,
    targetUserId: row.target_user_id,
    targetUsername: row.target_username,
    targetPromptId: row.target_prompt_id,
    details,
    createdAt: row.created_at,
  };
}

export function getUserStats(userId) {
  const promptsCount = db.prepare('SELECT COUNT(1) AS c FROM prompts WHERE author_user_id = ?').get(userId)?.c || 0;
  const likesCount = db.prepare('SELECT COALESCE(SUM(likes), 0) AS c FROM prompts WHERE author_user_id = ?').get(userId)?.c || 0;
  const savedCount = db.prepare('SELECT COUNT(1) AS c FROM prompts WHERE author_user_id = ? AND saved = 1').get(userId)?.c || 0;
  const historyCount = db.prepare('SELECT COUNT(1) AS c FROM gen_history WHERE user_id = ?').get(userId)?.c || 0;
  return { promptsCount, likesCount, savedCount, historyCount };
}

export function updateUserAdmin(userId, { isAdmin }) {
  if (isAdmin !== undefined) {
    db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin ? 1 : 0, userId);
  }
  return getUserById(userId);
}

export function deleteUser(userId) {
  // Delete user's prompts first (cascade)
  db.prepare('DELETE FROM prompts WHERE author_user_id = ?').run(userId);
  db.prepare('DELETE FROM gen_history WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM user_daily_rewards WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

// ── Billing / Subscriptions ────────────────────────────────────────────────────

function readUserBalance(userId) {
  const row = db.prepare('SELECT * FROM user_balance WHERE user_id = ?').get(userId);
  return row ? {
    userId: row.user_id,
    freeCredits: row.free_credits,
    paidCredits: row.paid_credits,
    totalCredits: row.free_credits + row.paid_credits,
    monthlyCreditQuota: row.monthly_credit_quota,
    creditPeriod: row.credit_period,
    creditsPerImage: CREDITS_PER_IMAGE,
    monthlyCarryoverRate: MONTHLY_CARRYOVER_RATE,
    lifetimeGenerations: row.lifetime_generations,
    updatedAt: row.updated_at,
  } : null;
}

function applyMonthlyCreditRollover(userId) {
  const row = db.prepare(`
    SELECT free_credits, paid_credits, monthly_credit_quota, credit_period
    FROM user_balance
    WHERE user_id = ?
  `).get(userId);
  if (!row) return;

  const currentPeriod = getBillingMonthKey();
  let creditPeriod = String(row.credit_period || '').trim();
  let freeCredits = Math.max(0, Number(row.free_credits) || 0);
  let paidCredits = Math.max(0, Number(row.paid_credits) || 0);
  let totalCredits = freeCredits + paidCredits;
  let monthlyQuota = Math.max(0, Number(row.monthly_credit_quota) || 0);
  let changed = false;

  if (!/^\d{4}-\d{2}$/.test(creditPeriod)) {
    creditPeriod = currentPeriod;
    monthlyQuota = Math.max(monthlyQuota, totalCredits);
    changed = true;
  }

  while (creditPeriod < currentPeriod) {
    const carryoverCap = Math.floor(monthlyQuota * MONTHLY_CARRYOVER_RATE);
    totalCredits = Math.min(totalCredits, carryoverCap);
    freeCredits = 0;
    paidCredits = totalCredits;
    monthlyQuota = totalCredits;
    creditPeriod = nextBillingMonth(creditPeriod);
    changed = true;
  }

  if (!changed) return;
  db.prepare(`
    UPDATE user_balance
    SET free_credits = ?,
        paid_credits = ?,
        monthly_credit_quota = ?,
        credit_period = ?,
        updated_at = ?
    WHERE user_id = ?
  `).run(
    freeCredits,
    paidCredits,
    monthlyQuota,
    creditPeriod,
    nowIso(),
    userId,
  );
}

export function getUserBalance(userId) {
  if (!userId) return null;
  applyMonthlyCreditRollover(userId);
  return readUserBalance(userId);
}

export function ensureUserBalance(userId, freeCredits = CREDITS_PER_IMAGE * 3) {
  const existing = db.prepare('SELECT user_id FROM user_balance WHERE user_id = ?').get(userId);
  if (existing) return getUserBalance(userId);
  const initialCredits = Math.max(0, Math.floor(Number(freeCredits) || 0));
  db.prepare(`
    INSERT INTO user_balance (
      user_id, free_credits, paid_credits, lifetime_generations,
      monthly_credit_quota, credit_period, credits_unit_version, updated_at
    )
    VALUES (?, ?, 0, 0, ?, ?, ?, ?)
  `).run(
    userId,
    initialCredits,
    initialCredits,
    getBillingMonthKey(),
    CREDIT_UNIT_VERSION,
    nowIso(),
  );
  return getUserBalance(userId);
}

function getRewardDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function claimDailyLoginReward(userId, { grant = true } = {}) {
  if (!userId) return { granted: false, credits: 0, rewardDate: getRewardDateKey() };

  const rewardDate = getRewardDateKey();
  const now = nowIso();
  const claim = db.transaction(() => {
    // Existing legacy accounts may not have a balance row yet. Do not grant
    // the new 6-image signup package; preserve their original 3-image
    // fallback, then add the daily points reward.
    ensureUserBalance(userId, CREDITS_PER_IMAGE * 3);
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO user_daily_rewards (user_id, reward_date, credits, created_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, rewardDate, grant ? CREDITS_PER_IMAGE : 0, now);

    if (inserted.changes === 0) {
      return { granted: false, credits: 0, rewardDate };
    }

    if (!grant) return { granted: false, credits: 0, rewardDate };

    db.prepare(`
      UPDATE user_balance
      SET free_credits = free_credits + ?,
          monthly_credit_quota = monthly_credit_quota + ?,
          updated_at = ?
      WHERE user_id = ?
    `).run(CREDITS_PER_IMAGE, CREDITS_PER_IMAGE, now, userId);
    return { granted: true, credits: CREDITS_PER_IMAGE, rewardDate };
  });

  return claim();
}

export function getTotalCredits(userId) {
  const bal = getUserBalance(userId);
  if (!bal) return 0;
  return bal.freeCredits + bal.paidCredits;
}

export function tryDeductCredit(userId) {
  // Atomic: deduct the first available credit type, but only if at least one
  // image's worth of points exists.
  applyMonthlyCreditRollover(userId);
  const now = nowIso();
  let res = db.prepare(`
    UPDATE user_balance
    SET free_credits = free_credits - ?,
        lifetime_generations = lifetime_generations + 1,
        updated_at = ?
    WHERE user_id = ? AND free_credits >= ?
  `).run(CREDITS_PER_IMAGE, now, userId, CREDITS_PER_IMAGE);
  if (res.changes > 0) return true;

  res = db.prepare(`
    UPDATE user_balance
    SET paid_credits = paid_credits - ?,
        lifetime_generations = lifetime_generations + 1,
        updated_at = ?
    WHERE user_id = ? AND paid_credits >= ?
  `).run(CREDITS_PER_IMAGE, now, userId, CREDITS_PER_IMAGE);
  return res.changes > 0;
}

export function deductCredit(userId) {
  tryDeductCredit(userId);   // legacy wrapper — callers who already checked balance
  return true;               // are safe; prefer tryDeductCredit for new code
}

export function addCredits(userId, amount, type = 'paid') {
  if (!Number.isFinite(amount) || amount === 0) return getUserBalance(userId);
  const normalizedAmount = Math.floor(Number(amount));
  if (normalizedAmount <= 0) return getUserBalance(userId);
  ensureUserBalance(userId, 0);
  applyMonthlyCreditRollover(userId);
  const now = nowIso();

  if (type === 'refund') {
    // Refunds restore paid points without changing the month's issued quota.
    const current = readUserBalance(userId);
    const refundAmt = Math.max(0, Math.min(normalizedAmount, current?.paidCredits || 0));
    if (refundAmt > 0) {
      db.prepare(`
        UPDATE user_balance
        SET paid_credits = paid_credits - ?, updated_at = ?
        WHERE user_id = ?
      `).run(refundAmt, now, userId);
    }
  } else if (normalizedAmount > 0) {
    // Positive additions count toward the current month's quota.
    if (type === 'paid') {
      db.prepare(`
        UPDATE user_balance
        SET paid_credits = paid_credits + ?,
            monthly_credit_quota = monthly_credit_quota + ?,
            updated_at = ?
        WHERE user_id = ?
      `).run(normalizedAmount, normalizedAmount, now, userId);
    } else {
      db.prepare(`
        UPDATE user_balance
        SET free_credits = free_credits + ?,
            monthly_credit_quota = monthly_credit_quota + ?,
            updated_at = ?
        WHERE user_id = ?
      `).run(normalizedAmount, normalizedAmount, now, userId);
    }
  }
  return getUserBalance(userId);
}

export function getSubscriptionByUserId(userId) {
  const row = db.prepare('SELECT * FROM subscriptions WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1').get(userId, 'active');
  return row ? {
    id: row.id,
    userId: row.user_id,
    plan: row.plan,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeCustomerId: row.stripe_customer_id,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
  } : null;
}

export function createSubscription({ id, userId, plan, stripeSubscriptionId, stripeCustomerId, currentPeriodStart, currentPeriodEnd }) {
  // Deactivate any existing active subscription for this user
  db.prepare("UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'").run(userId);
  db.prepare(`
    INSERT INTO subscriptions (id, user_id, plan, stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `).run(id, userId, plan, stripeSubscriptionId, stripeCustomerId, currentPeriodStart, currentPeriodEnd, nowIso());
  return getSubscriptionByUserId(userId);
}

export function updateSubscriptionStatus(stripeSubscriptionId, status, currentPeriodEnd) {
  const res = db.prepare('UPDATE subscriptions SET status = ?, current_period_end = ? WHERE stripe_subscription_id = ?')
    .run(status, currentPeriodEnd, stripeSubscriptionId);
  return res.changes > 0;
}

export function cancelSubscriptionByUserId(userId) {
  db.prepare("UPDATE subscriptions SET status = 'cancelled' WHERE user_id = ? AND status = 'active'").run(userId);
  return getSubscriptionByUserId(userId);
}

export function getUserBilling(userId) {
  if (!userId) return null;
  const balance = ensureUserBalance(userId, CREDITS_PER_IMAGE * 3);
  const subscription = getSubscriptionByUserId(userId);
  return { balance, subscription };
}

const DOMESTIC_PLAN_RANK = {
  starter_cny: 1,
  standard_cny: 2,
  premium_cny: 3,
};

export class RedeemCardError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function normalizeRedeemCode(code) {
  return String(code || '').trim().replace(/[\s-]/g, '').toUpperCase();
}

export function hashRedeemCode(code) {
  return createHash('sha256').update(normalizeRedeemCode(code)).digest('hex');
}

export function importRedeemCards(cards = []) {
  const uniqueCards = new Map();
  for (const card of Array.isArray(cards) ? cards : []) {
    const code = normalizeRedeemCode(card?.code);
    const planId = String(card?.planId || '').trim();
    const credits = Number(card?.credits);
    if (code.length < 8 || !DOMESTIC_PLAN_RANK[planId] || !Number.isInteger(credits) || credits <= 0) continue;
    const codeHash = hashRedeemCode(code);
    uniqueCards.set(codeHash, {
      codeHash,
      codeLast4: code.slice(-4),
      planId,
      credits,
      source: String(card?.source || 'domestic').trim() || 'domestic',
    });
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO redeem_cards (
      id, code_hash, code_last4, plan_id, credits, status, redeemed_by,
      redeemed_at, imported_at, source, credits_unit_version
    ) VALUES (?, ?, ?, ?, ?, 'available', NULL, NULL, ?, ?, ?)
  `);
  const now = nowIso();
  const addCards = db.transaction((items) => {
    let imported = 0;
    for (const card of items) {
      const result = insert.run(
        randomUUID(),
        card.codeHash,
        card.codeLast4,
        card.planId,
        card.credits,
        now,
        card.source,
        CREDIT_UNIT_VERSION,
      );
      imported += result.changes;
    }
    return imported;
  });

  const imported = addCards([...uniqueCards.values()]);
  return {
    imported,
    skipped: Math.max(0, (Array.isArray(cards) ? cards.length : 0) - imported),
  };
}

export function redeemCard({ code, userId }) {
  const normalizedCode = normalizeRedeemCode(code);
  if (normalizedCode.length < 8) {
    throw new RedeemCardError('INVALID', '卡密格式不正确');
  }

  const codeHash = hashRedeemCode(normalizedCode);
  const redeem = db.transaction(() => {
    const card = db.prepare(`
      SELECT id, code_last4, plan_id, credits, status
      FROM redeem_cards
      WHERE code_hash = ?
      LIMIT 1
    `).get(codeHash);

    if (!card) throw new RedeemCardError('INVALID', '卡密不存在');
    if (card.status === 'redeemed') throw new RedeemCardError('USED', '卡密已被兑换');
    if (card.status !== 'available') throw new RedeemCardError('DISABLED', '卡密已失效');

    const user = db.prepare('SELECT id, domestic_plan FROM users WHERE id = ?').get(userId);
    if (!user) throw new RedeemCardError('USER_NOT_FOUND', '用户不存在');

    const currentRank = DOMESTIC_PLAN_RANK[user.domestic_plan] || 0;
    const nextRank = DOMESTIC_PLAN_RANK[card.plan_id] || 0;
    if (!nextRank || currentRank >= nextRank) {
      throw new RedeemCardError('ALREADY_REDEEMED', '当前账户已有更高或相同套餐权益');
    }

    const now = nowIso();
    const claim = db.prepare(`
      UPDATE redeem_cards
      SET status = 'redeemed', redeemed_by = ?, redeemed_at = ?
      WHERE id = ? AND status = 'available'
    `).run(userId, now, card.id);
    if (claim.changes !== 1) throw new RedeemCardError('USED', '卡密已被兑换');

    db.prepare(`
      INSERT OR IGNORE INTO user_balance (
        user_id, free_credits, paid_credits, lifetime_generations,
        monthly_credit_quota, credit_period, credits_unit_version, updated_at
      ) VALUES (?, 0, 0, 0, 0, ?, ?, ?)
    `).run(userId, getBillingMonthKey(), CREDIT_UNIT_VERSION, now);
    applyMonthlyCreditRollover(userId);
    db.prepare(`
      UPDATE user_balance
      SET paid_credits = paid_credits + ?,
          monthly_credit_quota = monthly_credit_quota + ?,
          updated_at = ?
      WHERE user_id = ?
    `).run(card.credits, card.credits, now, userId);
    db.prepare(`
      UPDATE users
      SET domestic_plan = ?, domestic_plan_redeemed_at = ?, domestic_redeem_card_id = ?
      WHERE id = ?
    `).run(card.plan_id, now, card.id, userId);

    return {
      planId: card.plan_id,
      credits: card.credits,
      imageCount: Math.floor(card.credits / CREDITS_PER_IMAGE),
      cardLast4: card.code_last4,
    };
  });

  return redeem();
}

// Stripe webhook: check if event already processed
export function isWebhookEventProcessed(eventId) {
  return !!db.prepare('SELECT 1 FROM stripe_webhook_events WHERE event_id = ?').get(eventId);
}

export function markWebhookEventProcessed(id, eventId, eventType) {
  db.prepare('INSERT OR IGNORE INTO stripe_webhook_events (id, event_id, event_type, processed_at) VALUES (?, ?, ?, ?)')
    .run(id, eventId, eventType, nowIso());
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export function trackEvent({
  eventType,
  eventName,
  path,
  userId,
  sessionId,
  deviceType,
  referrer,
  extraData,
  isBot = false,
  ipAddress = '',
  country = '',
  region = '',
  city = '',
}) {
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare(`
    INSERT INTO page_events (id, event_type, event_name, path, user_id, session_id, device_type, referrer, ip_address, country, region, city, extra_data, is_bot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    eventType || 'page_view',
    eventName || '',
    path || '',
    userId || null,
    sessionId || '',
    deviceType || 'desktop',
    referrer || '',
    String(ipAddress || ''),
    String(country || ''),
    String(region || ''),
    String(city || ''),
    JSON.stringify(extraData || {}),
    isBot ? 1 : 0,
    createdAt,
  );
  return { id, createdAt };
}

const actionLabels = {
  act_generate_start:     '开始生成',
  act_generate_success:   '生成成功',
  act_generate_fail:      '生成失败',
  act_editor_generate_start: '编辑图开始生成',
  act_editor_generate_success: '编辑图生成成功',
  act_editor_generate_fail: '编辑图生成失败',
  act_upload:             '上传 Prompt',
  act_like:                '点赞',
  act_save:               '收藏',
  act_login:              '登录',
  act_register:           '注册',
  act_share:              '分享',
  act_copy_prompt:         '复制 Prompt',
  act_onboarding_complete: '完成引导',
  act_onboarding_skip:    '跳过引导',
};

function calcDelta(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

function getPeriodStats(sinceHours) {
  const sinceTime = new Date(Date.now() - Number(sinceHours) * 3600000).toISOString();
  const hours = Number(sinceHours);
  const isDaily = hours > 48;
  const bucketExpr = isDaily
    ? "strftime('%Y-%m-%d', created_at)"
    : "strftime('%Y-%m-%d %H:00', created_at)";

  const viewsRows = db.prepare(`
    SELECT
      ${bucketExpr} AS bucket,
      COUNT(*) AS views
    FROM page_events
    WHERE event_type = 'page_view' AND is_bot = 0 AND created_at >= ?
    GROUP BY bucket
    ORDER BY bucket ASC
  `).all(sinceTime);

  const topPages = db.prepare(`
    SELECT path, COUNT(*) AS views
    FROM page_events
    WHERE event_type = 'page_view' AND is_bot = 0 AND created_at >= ?
    GROUP BY path
    ORDER BY views DESC
    LIMIT 10
  `).all(sinceTime);

  const actionRows = db.prepare(`
    SELECT event_name, COUNT(*) AS count
    FROM page_events
    WHERE event_type = 'action' AND is_bot = 0 AND created_at >= ?
    GROUP BY event_name
    ORDER BY count DESC
  `).all(sinceTime);

  const activeUsers = db.prepare(`
    SELECT COUNT(DISTINCT user_id) AS c
    FROM page_events
    WHERE is_bot = 0 AND created_at >= ? AND user_id IS NOT NULL AND TRIM(user_id) != ''
  `).get(sinceTime)?.c || 0;

  const totalPageViews = db.prepare(`
    SELECT COUNT(*) AS c FROM page_events WHERE event_type = 'page_view' AND is_bot = 0 AND created_at >= ?
  `).get(sinceTime)?.c || 0;

  const totalActions = db.prepare(`
    SELECT COUNT(*) AS c FROM page_events WHERE event_type = 'action' AND is_bot = 0 AND created_at >= ?
  `).get(sinceTime)?.c || 0;

  const uniqueSessions = db.prepare(`
    SELECT COUNT(DISTINCT session_id) AS c FROM page_events WHERE is_bot = 0 AND created_at >= ? AND session_id != ''
  `).get(sinceTime)?.c || 0;

  const uniqueIps = db.prepare(`
    SELECT COUNT(DISTINCT CASE WHEN TRIM(ip_address) != '' AND TRIM(ip_address) NOT LIKE 'unknown%' THEN ip_address END) AS c
    FROM page_events
    WHERE is_bot = 0 AND created_at >= ?
  `).get(sinceTime)?.c || 0;

  const countryBreakdown = db.prepare(`
    SELECT
      CASE
        WHEN country IS NULL OR TRIM(country) = '' THEN 'Unknown'
        ELSE country
      END AS country,
      COUNT(*) AS count
    FROM page_events
    WHERE is_bot = 0 AND created_at >= ?
    GROUP BY CASE
      WHEN country IS NULL OR TRIM(country) = '' OR LOWER(TRIM(country)) = 'unknown' THEN 'Unknown'
      ELSE country
    END
    ORDER BY count DESC
    LIMIT 12
  `).all(sinceTime).map((r) => ({
    country: r.country || 'Unknown',
    count: Number(r.count || 0),
  }));

  const regionBreakdown = db.prepare(`
    SELECT
      CASE
        WHEN region IS NULL OR TRIM(region) = '' THEN 'Unknown'
        ELSE region
      END AS region,
      COUNT(*) AS count
    FROM page_events
    WHERE is_bot = 0 AND created_at >= ?
    GROUP BY CASE
      WHEN region IS NULL OR TRIM(region) = '' OR LOWER(TRIM(region)) = 'unknown' THEN 'Unknown'
      ELSE region
    END
    ORDER BY count DESC
    LIMIT 12
  `).all(sinceTime).map((r) => ({
    region: r.region || 'Unknown',
    count: Number(r.count || 0),
  }));

  const cityBreakdown = db.prepare(`
    SELECT
      CASE
        WHEN city IS NULL OR TRIM(city) = '' THEN 'Unknown'
        ELSE city
      END AS city,
      COUNT(*) AS count
    FROM page_events
    WHERE is_bot = 0 AND created_at >= ?
    GROUP BY CASE
      WHEN city IS NULL OR TRIM(city) = '' OR LOWER(TRIM(city)) = 'unknown' THEN 'Unknown'
      ELSE city
    END
    ORDER BY count DESC
    LIMIT 12
  `).all(sinceTime).map((r) => ({
    city: r.city || 'Unknown',
    count: Number(r.count || 0),
  }));

  const deviceBreakdown = db.prepare(`
    SELECT device_type, COUNT(*) AS count
    FROM page_events
    WHERE is_bot = 0 AND created_at >= ?
    GROUP BY device_type
    ORDER BY count DESC
  `).all(sinceTime);

  const referrerBreakdown = db.prepare(`
    SELECT
      CASE
        WHEN referrer LIKE '%google%' THEN 'Google'
        WHEN referrer LIKE '%bing%' THEN 'Bing'
        WHEN referrer LIKE '%duckduckgo%' THEN 'DuckDuckGo'
        WHEN referrer LIKE '%facebook%' THEN 'Facebook'
        WHEN referrer LIKE '%twitter%' OR referrer LIKE '%x.com%' THEN 'X/Twitter'
        WHEN referrer LIKE '%instagram%' THEN 'Instagram'
        WHEN referrer = '' OR referrer IS NULL THEN 'Direct'
        ELSE 'Other'
      END AS source,
      COUNT(*) AS count
    FROM page_events
    WHERE is_bot = 0 AND created_at >= ?
    GROUP BY source
    ORDER BY count DESC
  `).all(sinceTime);

  const geoKnownCount = db.prepare(`
    SELECT COUNT(*) AS c
    FROM page_events
    WHERE event_type = 'page_view' AND is_bot = 0 AND created_at >= ?
      AND country IS NOT NULL AND TRIM(country) != '' AND LOWER(TRIM(country)) != 'unknown'
  `).get(sinceTime)?.c || 0;

  const geoUnknownCount = Math.max(0, Number(totalPageViews || 0) - Number(geoKnownCount || 0));
  const geoKnownRate = totalPageViews > 0 ? Number(((geoKnownCount / totalPageViews) * 100).toFixed(1)) : 0;
  const geoUnknownRate = totalPageViews > 0 ? Number(((geoUnknownCount / totalPageViews) * 100).toFixed(1)) : 0;

  const generationRows = db.prepare(`
    SELECT event_name, extra_data
    FROM page_events
    WHERE event_type = 'action' AND is_bot = 0 AND created_at >= ?
      AND (
        event_name = 'act_generate_start'
        OR event_name = 'act_generate_success'
        OR event_name = 'act_generate_fail'
        OR event_name = 'act_editor_generate_start'
        OR event_name = 'act_editor_generate_success'
        OR event_name = 'act_editor_generate_fail'
      )
  `).all(sinceTime);

  const categoryCounter = new Map();
  const modeCounter = new Map();
  const statusCounter = new Map();
  for (const row of generationRows) {
    let extra = {};
    try { extra = JSON.parse(row.extra_data || '{}'); } catch { extra = {}; }
    const category = String(extra?.category || '').trim() || 'Unknown';
    const mode = String(extra?.mode || '').trim() || 'unknown';
    const status = String(row?.event_name || '').replace(/^act_/, '').replace(/^editor_/, '');
    categoryCounter.set(category, (categoryCounter.get(category) || 0) + 1);
    modeCounter.set(mode, (modeCounter.get(mode) || 0) + 1);
    statusCounter.set(status, (statusCounter.get(status) || 0) + 1);
  }

  const generationCategoryBreakdown = [...categoryCounter.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .slice(0, 16);

  const generationModeBreakdown = [...modeCounter.entries()]
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count || a.mode.localeCompare(b.mode));

  const generationStatusBreakdown = [...statusCounter.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));

  const trendCountriesSeed = countryBreakdown
    .map((r) => String(r.country || '').trim())
    .filter((name) => name && name !== 'Unknown')
    .slice(0, 4);
  const trendCountries = trendCountriesSeed.length > 0
    ? trendCountriesSeed
    : countryBreakdown.slice(0, 3).map((r) => String(r.country || 'Unknown'));

  let countryTrend = [];
  if (trendCountries.length > 0 && viewsRows.length > 0) {
    const placeholders = trendCountries.map(() => '?').join(', ');
    const trendRows = db.prepare(`
      SELECT bucket, country_norm AS country, COUNT(*) AS count
      FROM (
        SELECT
          ${bucketExpr} AS bucket,
          CASE
            WHEN country IS NULL OR TRIM(country) = '' OR LOWER(TRIM(country)) = 'unknown' THEN 'Unknown'
            ELSE country
          END AS country_norm
        FROM page_events
        WHERE event_type = 'page_view' AND is_bot = 0 AND created_at >= ?
      ) x
      WHERE country_norm IN (${placeholders})
      GROUP BY bucket, country_norm
      ORDER BY bucket ASC
    `).all(sinceTime, ...trendCountries);

    const bucketOrder = viewsRows.map((r) => r.bucket);
    const keyOf = (bucket, country) => `${bucket}__${country}`;
    const countMap = new Map(
      trendRows.map((r) => [keyOf(String(r.bucket || ''), String(r.country || 'Unknown')), Number(r.count || 0)]),
    );
    countryTrend = trendCountries.map((country) => ({
      country,
      series: bucketOrder.map((bucket) => ({
        bucket,
        count: Number(countMap.get(keyOf(bucket, country)) || 0),
      })),
    }));
  }

  return {
    totalPageViews,
    totalActions,
    activeUsers,
    uniqueSessions,
    uniqueIps,
    viewsOverTime: viewsRows,
    topPages: topPages.map(r => ({ path: r.path, views: r.views })),
    actionBreakdown: actionRows.map(r => ({
      event: r.event_name,
      label: actionLabels[r.event_name] || r.event_name,
      count: r.count,
    })),
    deviceBreakdown: deviceBreakdown.map(r => ({ device: r.device_type, count: r.count })),
    referrerBreakdown,
    countryBreakdown,
    regionBreakdown,
    cityBreakdown,
    geoQuality: {
      knownCount: Number(geoKnownCount || 0),
      unknownCount: Number(geoUnknownCount || 0),
      knownRate: geoKnownRate,
      unknownRate: geoUnknownRate,
    },
    generationCategoryBreakdown,
    generationModeBreakdown,
    generationStatusBreakdown,
    countryTrend,
  };
}

export function getAnalyticsStats({ sinceHours = 24, period = 'week' } = {}) {
  // Bot filtered count (for monitoring)
  const sinceTime = new Date(Date.now() - Number(sinceHours) * 3600000).toISOString();
  const hours = Number(sinceHours);
  const isDaily = hours > 48;

  const botEventsCount = db.prepare(`
    SELECT COUNT(*) AS c FROM page_events WHERE is_bot = 1 AND created_at >= ?
  `).get(sinceTime)?.c || 0;

  // Period comparison: previous equivalent period
  const compareHours = (() => {
    if (period === 'day')   return hours;   // vs previous 24h
    if (period === 'week')  return hours;   // vs previous 168h
    if (period === 'month') return hours;   // vs previous 720h
    return hours;
  })();

  const prevSinceTime = new Date(Date.now() - (hours + compareHours) * 3600000).toISOString();
  const prevPeriodStats = (() => {
    const rows = db.prepare(`
      SELECT
        ${isDaily
          ? "strftime('%Y-%m-%d', created_at) AS bucket"
          : "strftime('%Y-%m-%d %H:00', created_at) AS bucket"
        },
        COUNT(*) AS views
      FROM page_events
      WHERE event_type = 'page_view' AND is_bot = 0 AND created_at >= ? AND created_at < ?
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(prevSinceTime, sinceTime);

    const totalPageViews = db.prepare(`
      SELECT COUNT(*) AS c FROM page_events WHERE event_type = 'page_view' AND is_bot = 0 AND created_at >= ? AND created_at < ?
    `).get(prevSinceTime, sinceTime)?.c || 0;

    const totalActions = db.prepare(`
      SELECT COUNT(*) AS c FROM page_events WHERE event_type = 'action' AND is_bot = 0 AND created_at >= ? AND created_at < ?
    `).get(prevSinceTime, sinceTime)?.c || 0;

    const activeUsers = db.prepare(`
      SELECT COUNT(DISTINCT user_id) AS c FROM page_events WHERE is_bot = 0 AND created_at >= ? AND created_at < ? AND user_id IS NOT NULL AND TRIM(user_id) != ''
    `).get(prevSinceTime, sinceTime)?.c || 0;

  const uniqueSessions = db.prepare(`
    SELECT COUNT(DISTINCT session_id) AS c FROM page_events WHERE is_bot = 0 AND created_at >= ? AND created_at < ? AND session_id != ''
  `).get(prevSinceTime, sinceTime)?.c || 0;

    const uniqueIps = db.prepare(`
    SELECT COUNT(DISTINCT CASE WHEN TRIM(ip_address) != '' AND TRIM(ip_address) NOT LIKE 'unknown%' THEN ip_address END) AS c
      FROM page_events
      WHERE is_bot = 0 AND created_at >= ? AND created_at < ?
    `).get(prevSinceTime, sinceTime)?.c || 0;

    const countryBreakdown = db.prepare(`
      SELECT
        CASE
          WHEN country IS NULL OR TRIM(country) = '' THEN 'Unknown'
          ELSE country
        END AS country,
        COUNT(*) AS count
      FROM page_events
      WHERE is_bot = 0 AND created_at >= ? AND created_at < ?
      GROUP BY CASE
        WHEN country IS NULL OR TRIM(country) = '' OR LOWER(TRIM(country)) = 'unknown' THEN 'Unknown'
        ELSE country
      END
      ORDER BY count DESC
      LIMIT 12
    `).all(prevSinceTime, sinceTime).map((r) => ({ country: r.country || 'Unknown', count: Number(r.count || 0) }));

    const regionBreakdown = db.prepare(`
      SELECT
        CASE
          WHEN region IS NULL OR TRIM(region) = '' THEN 'Unknown'
          ELSE region
        END AS region,
        COUNT(*) AS count
      FROM page_events
      WHERE is_bot = 0 AND created_at >= ? AND created_at < ?
      GROUP BY CASE
        WHEN region IS NULL OR TRIM(region) = '' OR LOWER(TRIM(region)) = 'unknown' THEN 'Unknown'
        ELSE region
      END
      ORDER BY count DESC
      LIMIT 12
    `).all(prevSinceTime, sinceTime).map((r) => ({ region: r.region || 'Unknown', count: Number(r.count || 0) }));

    return { totalPageViews, totalActions, activeUsers, uniqueSessions, uniqueIps, countryBreakdown, regionBreakdown, viewsOverTime: rows };
  })();

  // Current period stats
  const currentStats = getPeriodStats(sinceHours);

  // KPI deltas
  const deltaPageViews   = calcDelta(currentStats.totalPageViews,  prevPeriodStats.totalPageViews);
  const deltaActions     = calcDelta(currentStats.totalActions,    prevPeriodStats.totalActions);
  const deltaActiveUsers = calcDelta(currentStats.activeUsers,     prevPeriodStats.activeUsers);
  const deltaSessions    = calcDelta(currentStats.uniqueSessions,  prevPeriodStats.uniqueSessions);

  // Today's snapshot (since midnight)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todaySince = todayStart.toISOString();
  const todayStats = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'page_view' THEN 1 ELSE 0 END) AS page_views,
      SUM(CASE WHEN event_type = 'action' THEN 1 ELSE 0 END) AS actions
    FROM page_events
    WHERE is_bot = 0 AND created_at >= ?
  `).get(todaySince) || { page_views: 0, actions: 0 };

  // Live unique sessions in last 5 minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const activeVisitors = db.prepare(`
    SELECT COUNT(DISTINCT session_id) AS c FROM page_events
    WHERE is_bot = 0 AND created_at >= ? AND session_id != ''
  `).get(fiveMinAgo)?.c || 0;

  return {
    periodHours: hours,
    period,
    activeVisitors,
    // Current KPIs
    totalPageViews:   currentStats.totalPageViews,
    totalActions:     currentStats.totalActions,
    activeUsers:      currentStats.activeUsers,
    uniqueSessions:   currentStats.uniqueSessions,
    uniqueIps:        currentStats.uniqueIps,
    botEventsCount,
    // Previous period for comparison
    prevPeriodPageViews:   prevPeriodStats.totalPageViews,
    prevPeriodActions:    prevPeriodStats.totalActions,
    prevPeriodActiveUsers: prevPeriodStats.activeUsers,
    prevPeriodSessions:   prevPeriodStats.uniqueSessions,
    // Deltas
    deltaPageViews,
    deltaActions,
    deltaActiveUsers,
    deltaSessions,
    // Today snapshot
    todayPageViews: todayStats.page_views || 0,
    todayActions:   todayStats.actions   || 0,
    // Breakdown
    viewsOverTime:     currentStats.viewsOverTime,
    topPages:          currentStats.topPages,
    actionBreakdown:   currentStats.actionBreakdown,
    deviceBreakdown:   currentStats.deviceBreakdown,
    referrerBreakdown: currentStats.referrerBreakdown,
    countryBreakdown:  currentStats.countryBreakdown,
    regionBreakdown:   currentStats.regionBreakdown,
    cityBreakdown:     currentStats.cityBreakdown,
    geoQuality:        currentStats.geoQuality,
    generationCategoryBreakdown: currentStats.generationCategoryBreakdown,
    generationModeBreakdown: currentStats.generationModeBreakdown,
    generationStatusBreakdown: currentStats.generationStatusBreakdown,
    countryTrend: currentStats.countryTrend,
  };
}

// ── Admin Account Management ─────────────────────────────────────────────────

export function createAdminAccount({ id, username, passwordHash, displayName = '', avatar = '' }) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO admin_accounts (id, username, password_hash, display_name, avatar, created_at, updated_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(id, username, passwordHash, displayName, avatar, now, now);
  return getAdminAccountById(id);
}

export function getAdminAccountById(id) {
  return db.prepare('SELECT * FROM admin_accounts WHERE id = ? AND is_active = 1').get(id);
}

export function getAdminAccountByUsername(username) {
  return db.prepare('SELECT * FROM admin_accounts WHERE username = ? AND is_active = 1').get(username);
}

export function updateAdminPasswordHash(adminId, passwordHash) {
  const now = nowIso();
  db.prepare(`
    UPDATE admin_accounts SET password_hash = ?, updated_at = ? WHERE id = ?
  `).run(passwordHash, now, adminId);
}

// ── Admin Sessions ──────────────────────────────────────────────────────────

export function createAdminSession({ id, adminId, token, expiresAt, ipAddress = '', userAgent = '' }) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO admin_sessions (id, admin_id, token, expires_at, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, adminId, token, expiresAt, ipAddress, userAgent, now);
  return { id, adminId, token, expiresAt, createdAt: now };
}

export function getAdminSessionByToken(token) {
  const now = nowIso();
  return db.prepare(`
    SELECT s.*, a.username, a.display_name, a.avatar
    FROM admin_sessions s
    JOIN admin_accounts a ON a.id = s.admin_id AND a.is_active = 1
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now);
}

export function updateAdminSessionExpiryByToken(token, expiresAt) {
  db.prepare('UPDATE admin_sessions SET expires_at = ? WHERE token = ?').run(expiresAt, token);
}

export function deleteAdminSessionByToken(token) {
  db.prepare('DELETE FROM admin_sessions WHERE token = ?').run(token);
}

export function deleteAdminSessionsByAdminId(adminId) {
  db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(adminId);
}

export function cleanExpiredAdminSessions() {
  const now = nowIso();
  try {
    db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now);
  } catch (e) {
    // Startup should never block on session cleanup when DB is busy.
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_BUSY_SNAPSHOT') return;
    throw e;
  }
}

// ── User Sessions ───────────────────────────────────────────────────────────

export function createUserSession({ id, userId, token, expiresAt, ipAddress = '', userAgent = '' }) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO user_sessions (id, user_id, token, expires_at, ip_address, user_agent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, token, expiresAt, ipAddress, userAgent, now);
  return { id, userId, token, expiresAt, createdAt: now };
}

export function getUserSessionByToken(token) {
  const now = nowIso();
  const row = db.prepare(`
    SELECT s.*, u.username, u.email, u.avatar, u.is_admin
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
    LIMIT 1
  `).get(token, now);
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    token: row.token,
    expires_at: row.expires_at,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    created_at: row.created_at,
    username: row.username,
    email: row.email,
    avatar: row.avatar,
    is_admin: row.is_admin,
  };
}

export function updateUserSessionExpiryByToken(token, expiresAt) {
  db.prepare('UPDATE user_sessions SET expires_at = ? WHERE token = ?').run(expiresAt, token);
}

export function deleteUserSessionByToken(token) {
  db.prepare('DELETE FROM user_sessions WHERE token = ?').run(token);
}

export function deleteUserSessionsByUserId(userId) {
  db.prepare('DELETE FROM user_sessions WHERE user_id = ?').run(userId);
}

export function cleanExpiredUserSessions() {
  const now = nowIso();
  try {
    db.prepare('DELETE FROM user_sessions WHERE expires_at <= ?').run(now);
  } catch (e) {
    if (e?.code === 'SQLITE_BUSY' || e?.code === 'SQLITE_BUSY_SNAPSHOT') return;
    throw e;
  }
}

// ── Editor Batches ──────────────────────────────────────────────────────────────────

export function createEditorBatch({ kind = 'editor_showcase', plannedCount = 0, details = {} } = {}) {
  const id = randomUUID();
  const now = nowIso();
  db.prepare(`
    INSERT INTO editor_batches (id, kind, status, planned_count, queued_count, succeeded_count, failed_count, details_json, created_at, updated_at)
    VALUES (?, ?, 'queued', ?, 0, 0, 0, ?, ?, ?)
  `).run(id, kind, Number(plannedCount), JSON.stringify(details), now, now);
  return { id, kind, status: 'queued', plannedCount, queuedCount: 0, succeededCount: 0, failedCount: 0, details, createdAt: now, updatedAt: now };
}

export function getEditorBatchById(id) {
  const row = db.prepare('SELECT * FROM editor_batches WHERE id = ?').get(id);
  return row ? rowToEditorBatch(row) : null;
}

export function touchEditorBatch(id, { queuedCount, succeededCount, failedCount, status, details } = {}) {
  const now = nowIso();
  const batch = db.prepare('SELECT * FROM editor_batches WHERE id = ?').get(id);
  if (!batch) return null;

  const newQueued = queuedCount !== undefined ? Number(queuedCount) : batch.queued_count;
  const newSucceeded = succeededCount !== undefined ? Number(succeededCount) : batch.succeeded_count;
  const newFailed = failedCount !== undefined ? Number(failedCount) : batch.failed_count;
  const newStatus = status || batch.status;
  const newDetails = details !== undefined ? JSON.stringify(details) : batch.details_json;

  db.prepare(`
    UPDATE editor_batches
    SET queued_count = ?, succeeded_count = ?, failed_count = ?, status = ?, details_json = ?, updated_at = ?
    WHERE id = ?
  `).run(newQueued, newSucceeded, newFailed, newStatus, newDetails, now, id);
  return getEditorBatchById(id);
}

function rowToEditorBatch(row) {
  let details = {};
  let generatedCategories = [];
  try { details = JSON.parse(row.details_json || '{}'); } catch { details = {}; }
  try { generatedCategories = JSON.parse(row.generated_categories_json || '[]'); } catch { generatedCategories = []; }
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    plannedCount: Number(row.planned_count || 0),
    queuedCount: Number(row.queued_count || 0),
    succeededCount: Number(row.succeeded_count || 0),
    failedCount: Number(row.failed_count || 0),
    details,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── Editor Items ──────────────────────────────────────────────────────────────────

export function enqueueEditorItem({ prompt, editInstruction, category = '', tags = [], batchId = null } = {}) {
  const now = nowIso();
  const itemId = randomUUID();

  // Enqueue step1: text-to-image generation
  const step1Job = enqueueGenJob({
    userId: null,
    mode: 'text',
    model: process.env.VITE_OPENAI_IMAGE_MODEL || 'gpt-image-2',
    size: '1024x1024',
    quality: 'hd',
    prompt: String(prompt || '').trim(),
    maxAttempts: 2,
    publishToPrompts: false,
    initialStatus: 'queued',
    isHeartbeat: true,
    heartbeatKind: 'editor_showcase',
    heartbeatCategory: category,
  });

  const step1JobId = step1Job?.id || null;

  db.prepare(`
    INSERT INTO editor_items (id, batch_id, prompt, edit_instruction, category, tags_json, step1_job_id, step1_status, step2_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 'pending', ?, ?)
  `).run(
    itemId,
    batchId || null,
    String(prompt || '').trim(),
    String(editInstruction || '').trim(),
    category,
    JSON.stringify(Array.isArray(tags) ? tags : []),
    step1JobId,
    now,
    now,
  );

  // Update batch queued count
  if (batchId) {
    const batch = db.prepare('SELECT queued_count FROM editor_batches WHERE id = ?').get(batchId);
    if (batch) {
      db.prepare('UPDATE editor_batches SET queued_count = ?, updated_at = ? WHERE id = ?')
        .run(Number(batch.queued_count || 0) + 1, now, batchId);
    }
  }

  return { id: itemId, step1JobId, step2JobId: null };
}

export function getEditorItemById(id) {
  const row = db.prepare('SELECT * FROM editor_items WHERE id = ?').get(id);
  return row ? rowToEditorItem(row) : null;
}

export function getEditorItemByStep1JobId(step1JobId) {
  const row = db.prepare('SELECT * FROM editor_items WHERE step1_job_id = ?').get(step1JobId);
  return row ? rowToEditorItem(row) : null;
}

export function getEditorItemByStep2JobId(step2JobId) {
  const row = db.prepare('SELECT * FROM editor_items WHERE step2_job_id = ?').get(step2JobId);
  return row ? rowToEditorItem(row) : null;
}

function rowToEditorItem(row) {
  let tags = [];
  try { tags = JSON.parse(row.tags_json || '[]'); } catch { tags = []; }
  return {
    id: row.id,
    batchId: row.batch_id || null,
    prompt: row.prompt,
    editInstruction: row.edit_instruction,
    category: row.category,
    tags,
    step1JobId: row.step1_job_id || null,
    step2JobId: row.step2_job_id || null,
    step1Status: row.step1_status,
    step2Status: row.step2_status,
    resultBaseUrl: row.result_base_url || null,
    resultEditedUrl: row.result_edited_url || null,
    publishedToPrompts: !!row.published_to_prompts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Called by genQueueWorker when step1 (text generation) succeeds.
 * 1. Updates step1 result URL
 * 2. Enqueues step2 (edit mode) using the base image URL
 * 3. Updates step1_status = 'succeeded', step2_status = 'queued'
 */
export function advanceEditorItemFromStep1(step1JobId, baseImageUrl) {
  const now = nowIso();
  const item = db.prepare('SELECT * FROM editor_items WHERE step1_job_id = ?').get(step1JobId);
  if (!item) return null;

  // Enqueue step2: edit mode using the base image — priority 10 so it jumps
  // ahead of any pending step1 text jobs in the shared FIFO queue.
  const step2Job = enqueueGenJob({
    userId: null,
    mode: 'edit',
    model: process.env.VITE_OPENAI_IMAGE_MODEL || 'gpt-image-2',
    size: '1024x1024',
    quality: 'hd',
    prompt: item.edit_instruction || '',
    editStrength: 0.65,
    referenceImageUrl: baseImageUrl,
    maxAttempts: 2,
    publishToPrompts: false,
    initialStatus: 'queued',
    isHeartbeat: true,
    heartbeatKind: 'editor_showcase',
    heartbeatCategory: item.category,
    priority: 10,
  });

  const step2JobId = step2Job?.id || null;

  db.prepare(`
    UPDATE editor_items
    SET step1_status = 'succeeded',
        step2_status = 'queued',
        step2_job_id = ?,
        result_base_url = ?,
        updated_at = ?
    WHERE step1_job_id = ?
  `).run(step2JobId, baseImageUrl, now, step1JobId);

  return { step2JobId, itemId: item.id };
}

/**
 * Called by genQueueWorker when step2 (edit generation) succeeds.
 * 1. Uploads base64 image to cloud storage (if configured)
 * 2. Updates step2 result URL
 * 3. Publishes the result to prompts table
 */
export async function advanceEditorItemFromStep2(step2JobId, editedImageUrl) {
  const now = nowIso();
  const item = db.prepare('SELECT * FROM editor_items WHERE step2_job_id = ?').get(step2JobId);
  if (!item) return null;

  // Upload base64 image to cloud storage (or keep base64 if not configured)
  let publishedImageUrl = editedImageUrl || '';
  if (isStorageConfigured() && editedImageUrl?.startsWith('data:')) {
    const key = `generated/${step2JobId}-edited.png`;
    try {
      publishedImageUrl = await resolveImageUrl(editedImageUrl, key);
    } catch (err) {
      console.warn(`[advanceEditorItemFromStep2] storage upload failed, publishing without raw base64: ${err.message}`);
      publishedImageUrl = materializeDataUrlIfNeeded(editedImageUrl, 'editor');
    }
  } else if (editedImageUrl?.startsWith('data:')) {
    publishedImageUrl = materializeDataUrlIfNeeded(editedImageUrl, 'editor');
  }
  if (publishedImageUrl.startsWith('data:')) {
    publishedImageUrl = '';
  }
  if (!publishedImageUrl) {
    throw new Error('INVALID_PUBLISHED_IMAGE_URL');
  }

  // Never persist raw base64 in prompts.extra_data; keep only a durable URL or empty string.
  const originalImageUrl = item.result_base_url?.startsWith('data:')
    ? ''
    : String(item.result_base_url || '');

  // Update step2 status and result URL
  db.prepare(`
    UPDATE editor_items
    SET step2_status = 'succeeded',
        result_edited_url = ?,
        updated_at = ?
    WHERE step2_job_id = ?
  `).run(publishedImageUrl, now, step2JobId);

  // Publish to prompts table (final result is the edited image URL)
  let tags = [];
  try { tags = JSON.parse(item.tags_json || '[]'); } catch { tags = []; }

  db.prepare(`
    INSERT INTO prompts (id, image_url, prompt, author_name, author_avatar, author_prompt_count, tags_json, category, likes, liked, saved, created_at, extra_data)
    VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, 0, 0, ?, ?)
  `).run(
    randomUUID(),
    publishedImageUrl || '',
    item.prompt || '',
    'Lovioa Demo',
    'https://api.dicebear.com/7.x/miniavs/svg?seed=lovioa-demo',
    JSON.stringify(tags),
    item.category || 'Abstract',
    now,
    JSON.stringify({ originalImageUrl, editInstruction: item.edit_instruction }),
  );

  // Mark as published
  db.prepare('UPDATE editor_items SET published_to_prompts = 1, updated_at = ? WHERE id = ?').run(now, item.id);

  // Update batch succeeded count
  if (item.batch_id) {
    const batch = db.prepare('SELECT succeeded_count FROM editor_batches WHERE id = ?').get(item.batch_id);
    if (batch) {
      db.prepare('UPDATE editor_batches SET succeeded_count = ?, updated_at = ? WHERE id = ?')
        .run(Number(batch.succeeded_count || 0) + 1, now, item.batch_id);
    }
  }

  return { itemId: item.id, batchId: item.batch_id };
}

/**
 * Called by genQueueWorker when step2 fails.
 */
/**
 * Called by genQueueWorker when step2 fails.
 * Only marks permanently failed when the job is truly exhausted (attempt_count >= max_attempts).
 * During normal retry cycles, keeps step2_status='pending' so the item can be retried.
 */
export function markEditorItemStep2Failed(step2JobId, errorMessage, options = {}) {
  const now = nowIso();
  const item = db.prepare('SELECT * FROM editor_items WHERE step2_job_id = ?').get(step2JobId);
  if (!item) return null;

  // Check retryability — only permanently fail if exhausted.
  // During retry cycles, keep step2_status='pending' so the item stays queued for retry.
  const job = db.prepare('SELECT attempt_count, max_attempts FROM gen_jobs WHERE id = ?').get(step2JobId);
  const exhausted = job ? job.attempt_count >= job.max_attempts : true;
  const nextStatus = exhausted ? 'failed' : 'pending';

  db.prepare(`
    UPDATE editor_items
    SET step2_status = ?,
        updated_at = ?
    WHERE step2_job_id = ?
  `).run(nextStatus, now, step2JobId);

  if (item.batch_id) {
    const batch = db.prepare('SELECT failed_count FROM editor_batches WHERE id = ?').get(item.batch_id);
    if (batch) {
      db.prepare('UPDATE editor_batches SET failed_count = ?, updated_at = ? WHERE id = ?')
        .run(Number(batch.failed_count || 0) + 1, now, item.batch_id);
    }
  }
  return { itemId: item.id };
}

/**
 * Called by genQueueWorker when step1 fails.
 */
export function markEditorItemStep1Failed(step1JobId) {
  const now = nowIso();
  const item = db.prepare('SELECT * FROM editor_items WHERE step1_job_id = ?').get(step1JobId);
  if (!item) return null;

  // Only mark permanently failed if the job is truly exhausted (max_attempts reached).
  // During normal retry cycles, keep step2_status='pending' so the item is NOT blocked —
  // when step1 eventually succeeds, advanceEditorItemFromStep1 re-enqueues step2.
  db.prepare(`
    UPDATE editor_items
    SET step1_status = 'failed',
        step2_status = 'pending',   -- NOT 'failed' — allow step2 requeue when step1 retries succeed
        updated_at = ?
    WHERE step1_job_id = ?
  `).run(now, step1JobId);

  if (item.batch_id) {
    const batch = db.prepare('SELECT failed_count FROM editor_batches WHERE id = ?').get(item.batch_id);
    if (batch) {
      db.prepare('UPDATE editor_batches SET failed_count = ?, updated_at = ? WHERE id = ?')
        .run(Number(batch.failed_count || 0) + 1, now, item.batch_id);
    }
  }
  return { itemId: item.id };
}
