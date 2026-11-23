import { randomUUID } from 'crypto';
import { db } from './promptsRepo.js';

const MAX_EVENT_PAYLOAD_LENGTH = 240000;
const MAX_ARTIFACT_PAYLOAD_LENGTH = 8000000;
const MAX_STRING_LENGTH = 50000;
const PRIVATE_KEYS = new Set([
  'apikey',
  'authorization',
  'password',
  'passwordhash',
  'secret',
  'token',
  'access_token',
  'refresh_token',
  'cookie',
  'set-cookie',
]);

let tablesReady = false;

function nowIso() {
  return new Date().toISOString();
}

function normalizeString(value, maxLength = MAX_STRING_LENGTH) {
  return String(value || '').trim().slice(0, maxLength);
}

function snapshotValue(value, key = '') {
  if (PRIVATE_KEYS.has(String(key).toLowerCase())) return '[redacted]';
  if (typeof value === 'string') return value.slice(0, MAX_STRING_LENGTH);
  if (Array.isArray(value)) return value.map(item => snapshotValue(item, key));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      snapshotValue(entryValue, entryKey),
    ]),
  );
}

function serializePayload(value) {
  const snapshot = snapshotValue(value);
  const serialized = JSON.stringify(snapshot === undefined ? null : snapshot);
  if (serialized.length <= MAX_EVENT_PAYLOAD_LENGTH) return serialized;
  return JSON.stringify({
    truncated: true,
    preview: serialized.slice(0, MAX_EVENT_PAYLOAD_LENGTH - 80),
  });
}

function serializeArtifact(value) {
  const snapshot = snapshotValue(value);
  const serialized = JSON.stringify(snapshot === undefined ? null : snapshot);
  if (serialized.length > MAX_ARTIFACT_PAYLOAD_LENGTH) {
    throw new Error(
      `Agent artifact payload exceeds ${MAX_ARTIFACT_PAYLOAD_LENGTH} characters`,
    );
  }
  return serialized;
}

export function ensureAgentRunTables() {
  if (tablesReady) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL DEFAULT '',
      prompt_text TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'running',
      error_code TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      last_seq INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_agent_runs_user_started
      ON agent_runs(user_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_status_started
      ON agent_runs(status, started_at DESC);

    CREATE TABLE IF NOT EXISTS agent_run_events (
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      turn INTEGER,
      step INTEGER,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      PRIMARY KEY (run_id, seq),
      FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_run_events_run_seq
      ON agent_run_events(run_id, seq);

    CREATE TABLE IF NOT EXISTS agent_run_artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      turn INTEGER,
      step INTEGER,
      chunk_index INTEGER,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_run_artifacts_run_created
      ON agent_run_artifacts(run_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_agent_run_artifacts_run_type
      ON agent_run_artifacts(run_id, artifact_type, created_at ASC);

    CREATE TABLE IF NOT EXISTS agent_run_checkpoints (
      run_id TEXT NOT NULL,
      checkpoint_seq INTEGER NOT NULL,
      step INTEGER,
      phase TEXT NOT NULL,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (run_id, checkpoint_seq),
      FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_run_checkpoints_run_seq
      ON agent_run_checkpoints(run_id, checkpoint_seq DESC);
  `);
  tablesReady = true;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function rowToAgentRun(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    agentId: row.agent_id,
    conversationId: row.conversation_id || '',
    prompt: row.prompt_text || '',
    metadata: parseJson(row.metadata_json || '{}', {}),
    status: row.status,
    errorCode: row.error_code || '',
    errorMessage: row.error_message || '',
    lastSeq: Number(row.last_seq || 0),
    startedAt: row.started_at,
    finishedAt: row.finished_at || null,
  };
}

function rowToAgentEvent(row) {
  return {
    runId: row.run_id,
    seq: Number(row.seq),
    type: row.event_type,
    turn: row.turn === null ? null : Number(row.turn),
    step: row.step === null ? null : Number(row.step),
    payload: parseJson(row.payload_json || '{}', {}),
    createdAt: row.created_at,
  };
}

function rowToAgentArtifact(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    type: row.artifact_type,
    turn: row.turn === null ? null : Number(row.turn),
    step: row.step === null ? null : Number(row.step),
    chunkIndex: row.chunk_index === null ? null : Number(row.chunk_index),
    payload: parseJson(row.payload_json || 'null', null),
    createdAt: row.created_at,
  };
}

function rowToAgentCheckpoint(row) {
  if (!row) return null;
  return {
    runId: row.run_id,
    seq: Number(row.checkpoint_seq),
    step: row.step === null ? null : Number(row.step),
    phase: row.phase,
    state: parseJson(row.state_json || '{}', {}),
    createdAt: row.created_at,
  };
}

export function beginAgentRun({
  id = randomUUID(),
  userId,
  agentId,
  conversationId = '',
  prompt = '',
  metadata = {},
} = {}) {
  ensureAgentRunTables();
  const normalizedUserId = normalizeString(userId, 160);
  const normalizedAgentId = normalizeString(agentId, 120);
  if (!normalizedUserId) throw new Error('Agent run userId is required');
  if (!normalizedAgentId) throw new Error('Agent run agentId is required');

  const startedAt = nowIso();
  db.prepare(`
    INSERT INTO agent_runs (
      id, user_id, agent_id, conversation_id, prompt_text, metadata_json,
      status, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
  `).run(
    normalizeString(id, 160),
    normalizedUserId,
    normalizedAgentId,
    normalizeString(conversationId, 160),
    normalizeString(prompt),
    serializePayload(metadata),
    startedAt,
  );

  return getAgentRunForUser(id, normalizedUserId);
}

export function appendAgentRunEvent({
  runId,
  type,
  turn = null,
  step = null,
  payload = {},
} = {}) {
  ensureAgentRunTables();
  const normalizedRunId = normalizeString(runId, 160);
  const eventType = normalizeString(type, 120);
  if (!normalizedRunId) throw new Error('Agent event runId is required');
  if (!eventType) throw new Error('Agent event type is required');

  const append = db.transaction(() => {
    const run = db.prepare('SELECT last_seq FROM agent_runs WHERE id = ?').get(normalizedRunId);
    if (!run) throw new Error(`Agent run "${normalizedRunId}" does not exist`);
    const seq = Number(run.last_seq || 0) + 1;
    db.prepare(`
      INSERT INTO agent_run_events (
        run_id, seq, event_type, turn, step, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizedRunId,
      seq,
      eventType,
      Number.isInteger(turn) ? turn : null,
      Number.isInteger(step) ? step : null,
      serializePayload(payload),
      nowIso(),
    );
    db.prepare('UPDATE agent_runs SET last_seq = ? WHERE id = ?').run(seq, normalizedRunId);
    return seq;
  });

  return append();
}

export function appendAgentRunArtifact({
  id = randomUUID(),
  runId,
  type,
  turn = null,
  step = null,
  chunkIndex = null,
  payload = null,
} = {}) {
  ensureAgentRunTables();
  const normalizedRunId = normalizeString(runId, 160);
  const artifactType = normalizeString(type, 120);
  if (!normalizedRunId) throw new Error('Agent artifact runId is required');
  if (!artifactType) throw new Error('Agent artifact type is required');

  const artifactId = normalizeString(id, 160);
  const run = db.prepare('SELECT id FROM agent_runs WHERE id = ?').get(normalizedRunId);
  if (!run) throw new Error(`Agent run "${normalizedRunId}" does not exist`);

  db.prepare(`
    INSERT INTO agent_run_artifacts (
      id, run_id, artifact_type, turn, step, chunk_index, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    artifactId,
    normalizedRunId,
    artifactType,
    Number.isInteger(turn) ? turn : null,
    Number.isInteger(step) ? step : null,
    Number.isInteger(chunkIndex) ? chunkIndex : null,
    serializeArtifact(payload),
    nowIso(),
  );
  return artifactId;
}

export function saveAgentRunCheckpoint({
  runId,
  step = null,
  phase = 'unknown',
  state = {},
} = {}) {
  ensureAgentRunTables();
  const normalizedRunId = normalizeString(runId, 160);
  const normalizedPhase = normalizeString(phase, 120);
  if (!normalizedRunId) throw new Error('Agent checkpoint runId is required');
  if (!normalizedPhase) throw new Error('Agent checkpoint phase is required');

  const save = db.transaction(() => {
    const run = db.prepare('SELECT id FROM agent_runs WHERE id = ?').get(normalizedRunId);
    if (!run) throw new Error(`Agent run "${normalizedRunId}" does not exist`);
    const last = db.prepare(`
      SELECT checkpoint_seq
      FROM agent_run_checkpoints
      WHERE run_id = ?
      ORDER BY checkpoint_seq DESC
      LIMIT 1
    `).get(normalizedRunId);
    const checkpointSeq = Number(last?.checkpoint_seq || 0) + 1;
    db.prepare(`
      INSERT INTO agent_run_checkpoints (
        run_id, checkpoint_seq, step, phase, state_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      normalizedRunId,
      checkpointSeq,
      Number.isInteger(step) ? step : null,
      normalizedPhase,
      serializeArtifact(state),
      nowIso(),
    );
    return checkpointSeq;
  });
  return save();
}

export function finishAgentRun({
  runId,
  status,
  errorCode = '',
  errorMessage = '',
} = {}) {
  ensureAgentRunTables();
  const normalizedStatus = ['completed', 'failed', 'cancelled'].includes(status)
    ? status
    : 'failed';
  db.prepare(`
    UPDATE agent_runs
    SET status = ?, error_code = ?, error_message = ?, finished_at = ?
    WHERE id = ?
  `).run(
    normalizedStatus,
    normalizeString(errorCode, 120),
    normalizeString(errorMessage, 2000),
    nowIso(),
    normalizeString(runId, 160),
  );
  return getAgentRun(runId);
}

export function getAgentRun(runId) {
  ensureAgentRunTables();
  const row = db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(normalizeString(runId, 160));
  return rowToAgentRun(row);
}

export function getAgentRunForUser(runId, userId) {
  ensureAgentRunTables();
  const row = db.prepare(`
    SELECT * FROM agent_runs
    WHERE id = ? AND user_id = ?
  `).get(normalizeString(runId, 160), normalizeString(userId, 160));
  return rowToAgentRun(row);
}

export function getLatestAgentRunCheckpoint(runId, userId) {
  ensureAgentRunTables();
  const run = getAgentRunForUser(runId, userId);
  if (!run) return null;
  const row = db.prepare(`
    SELECT run_id, checkpoint_seq, step, phase, state_json, created_at
    FROM agent_run_checkpoints
    WHERE run_id = ?
    ORDER BY checkpoint_seq DESC
    LIMIT 1
  `).get(run.id);
  return rowToAgentCheckpoint(row);
}

export function listAgentRunArtifacts(runId, userId, { type = '', limit = 100 } = {}) {
  ensureAgentRunTables();
  const run = getAgentRunForUser(runId, userId);
  if (!run) return null;
  const normalizedType = normalizeString(type, 120);
  const normalizedLimit = Math.min(
    200,
    Math.max(1, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : 100),
  );
  const rows = db.prepare(`
    SELECT id, run_id, artifact_type, turn, step, chunk_index, payload_json, created_at
    FROM agent_run_artifacts
    WHERE run_id = ?
      AND (? = '' OR artifact_type = ?)
    ORDER BY created_at ASC
    LIMIT ?
  `).all(run.id, normalizedType, normalizedType, normalizedLimit);
  return rows.map(rowToAgentArtifact);
}

export function getAgentRunArtifact(runId, userId, artifactId) {
  ensureAgentRunTables();
  const run = getAgentRunForUser(runId, userId);
  if (!run) return null;
  const row = db.prepare(`
    SELECT id, run_id, artifact_type, turn, step, chunk_index, payload_json, created_at
    FROM agent_run_artifacts
    WHERE run_id = ? AND id = ?
  `).get(run.id, normalizeString(artifactId, 160));
  return rowToAgentArtifact(row);
}

export function listAgentRunEvents(runId, userId) {
  ensureAgentRunTables();
  const run = getAgentRunForUser(runId, userId);
  if (!run) return null;
  const rows = db.prepare(`
    SELECT run_id, seq, event_type, turn, step, payload_json, created_at
    FROM agent_run_events
    WHERE run_id = ?
    ORDER BY seq ASC
  `).all(run.id);
  const checkpoint = getLatestAgentRunCheckpoint(run.id, userId);
  return {
    run,
    events: rows.map(rowToAgentEvent),
    checkpoint: checkpoint
      ? {
          runId: checkpoint.runId,
          seq: checkpoint.seq,
          step: checkpoint.step,
          phase: checkpoint.phase,
          createdAt: checkpoint.createdAt,
        }
      : null,
  };
}
