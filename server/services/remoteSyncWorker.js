import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../db/promptsRepo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.join(__dirname, '..');

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeError(err) {
  return String(err?.message || err || 'unknown error').slice(0, 1000);
}

function localImagePathFromUrl(imageUrl) {
  const url = String(imageUrl || '');
  if (!url.startsWith('/uploads/')) return null;
  return path.join(SERVER_ROOT, url.slice(1));
}

function mimeFromFilePath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

function remoteHeaders(remoteUserId) {
  const headers = {};
  if (remoteUserId) headers['x-user-id'] = remoteUserId;
  if (process.env.REMOTE_SYNC_SECRET) headers['x-remote-sync-secret'] = process.env.REMOTE_SYNC_SECRET;
  return headers;
}

function ensureSyncTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gen_history_remote_sync (
      history_id TEXT PRIMARY KEY,
      remote_job_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      synced_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_gen_history_remote_sync_status ON gen_history_remote_sync(status, updated_at DESC);
  `);
}

function listPendingRows(limit = 5) {
  return db.prepare(`
    SELECT gh.*
    FROM gen_history gh
    LEFT JOIN gen_history_remote_sync rs ON rs.history_id = gh.id
    WHERE gh.moderation_status = 'approved'
      AND gh.image_url IS NOT NULL
      AND TRIM(gh.image_url) <> ''
      AND gh.image_url NOT LIKE 'data:%'
      AND (rs.status IS NULL OR rs.status <> 'succeeded')
    ORDER BY gh.created_at ASC
    LIMIT ?
  `).all(Math.max(1, Math.min(50, Number(limit || 5))));
}

function markPending(historyId, remoteJobId) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO gen_history_remote_sync (history_id, remote_job_id, status, attempts, last_error, synced_at, updated_at)
    VALUES (?, ?, 'pending', 0, '', NULL, ?)
    ON CONFLICT(history_id) DO UPDATE SET
      remote_job_id = excluded.remote_job_id,
      status = 'pending',
      updated_at = excluded.updated_at
  `).run(historyId, remoteJobId, now);
}

function markSucceeded(historyId) {
  const now = nowIso();
  db.prepare(`
    UPDATE gen_history_remote_sync
    SET status = 'succeeded',
        synced_at = ?,
        last_error = '',
        updated_at = ?
    WHERE history_id = ?
  `).run(now, now, historyId);
}

function markFailed(historyId, message) {
  const now = nowIso();
  db.prepare(`
    INSERT INTO gen_history_remote_sync (history_id, remote_job_id, status, attempts, last_error, synced_at, updated_at)
    VALUES (?, ?, 'failed', 1, ?, NULL, ?)
    ON CONFLICT(history_id) DO UPDATE SET
      status = 'failed',
      attempts = attempts + 1,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).run(historyId, `localsync-${historyId}`, message, now);
}

async function uploadToRemote({ remoteBaseUrl, remoteUserId, imageUrl }) {
  const localPath = localImagePathFromUrl(imageUrl);
  if (!localPath) return imageUrl;

  const binary = await readFile(localPath);
  const mime = mimeFromFilePath(localPath);
  const fileName = path.basename(localPath);

  const form = new FormData();
  form.append('image', new Blob([binary], { type: mime }), fileName);

  const res = await fetch(`${remoteBaseUrl}/api/upload`, {
    method: 'POST',
    headers: remoteHeaders(remoteUserId),
    body: form,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`upload failed HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data?.url) throw new Error('upload response missing url');
  return data.url;
}

async function pushHistoryToRemote({ remoteBaseUrl, remoteUserId, row, remoteImageUrl }) {
  const remoteJobId = `localsync-${row.id}`;
  const payload = {
    imageUrl: remoteImageUrl,
    prompt: row.prompt || '',
    model: row.model || '',
    mode: row.mode || 'text',
    userId: null,
    jobId: remoteJobId,
    category: row.category || 'Generated',
    publishToPrompts: true,
  };

  const syncPath = process.env.REMOTE_SYNC_SECRET ? '/api/internal/history-sync' : '/api/history';
  const res = await fetch(`${remoteBaseUrl}${syncPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...remoteHeaders(remoteUserId),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`history push failed HTTP ${res.status}: ${txt.slice(0, 300)}`);
  }
}

export function startRemoteSyncWorker({
  enabled = false,
  remoteBaseUrl = '',
  remoteUserId = '',
  pollIntervalMs = 12000,
  batchSize = 2,
  logger = console,
}) {
  let stopped = false;
  let loopPromise = Promise.resolve();

  if (!enabled || !remoteBaseUrl) {
    logger.info('[remote-sync] disabled');
    return {
      stop() { stopped = true; },
      wait() { return loopPromise; },
    };
  }

  ensureSyncTable();
  const target = String(remoteBaseUrl).replace(/\/+$/, '');

  async function loop() {
    logger.info(`[remote-sync] started -> ${target}`);
    while (!stopped) {
      try {
        const rows = listPendingRows(batchSize);
        if (rows.length === 0) {
          await sleep(pollIntervalMs);
          continue;
        }

        for (const row of rows) {
          if (stopped) break;
          const remoteJobId = `localsync-${row.id}`;
          try {
            markPending(row.id, remoteJobId);
            const remoteImageUrl = await uploadToRemote({
              remoteBaseUrl: target,
              remoteUserId,
              imageUrl: row.image_url,
            });
            await pushHistoryToRemote({
              remoteBaseUrl: target,
              remoteUserId,
              row,
              remoteImageUrl,
            });
            markSucceeded(row.id);
          } catch (err) {
            markFailed(row.id, sanitizeError(err));
            logger.warn(`[remote-sync] failed ${row.id}: ${sanitizeError(err)}`);
          }
        }
      } catch (err) {
        logger.warn(`[remote-sync] loop error: ${sanitizeError(err)}`);
      }
      await sleep(pollIntervalMs);
    }
    logger.info('[remote-sync] stopped');
  }

  loopPromise = loop();
  return {
    stop() { stopped = true; },
    wait() { return loopPromise; },
  };
}
