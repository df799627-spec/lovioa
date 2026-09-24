import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startGenQueueWorker } from './services/genQueueWorker.js';
import { startRemoteSyncWorker } from './services/remoteSyncWorker.js';
import { startHeartbeatWorker } from './services/heartbeatWorker.js';
import { startEditorBatchWorker } from './services/editorBatchWorker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env'));
loadEnvFile(path.join(__dirname, '.env'));

const OPENAI_BASE_URL = process.env.OPENAI_API_BASE_URL || process.env.VITE_OPENAI_API_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY || '';
const OPENAI_IMAGE_MODEL_KEYS = process.env.OPENAI_IMAGE_MODEL_KEYS || '';
const GEN_FAST_API_BASE_URL = process.env.GEN_FAST_API_BASE_URL || '';
const GEN_FAST_API_BASE_URL_CN = process.env.GEN_FAST_API_BASE_URL_CN || '';
const GEN_FAST_API_PATH = process.env.GEN_FAST_API_PATH || '/v1/api/generate';
const GEN_FAST_RESULT_PATH = process.env.GEN_FAST_RESULT_PATH || '/v1/api/result';
const GEN_FAST_API_KEY = process.env.GEN_FAST_API_KEY || '';
const GEN_FAST_REPLY_TYPE = process.env.GEN_FAST_REPLY_TYPE || 'json';
const GEN_FAST_MODELS = process.env.GEN_FAST_MODELS || '';
const GEN_FAST_QUALITIES = process.env.GEN_FAST_QUALITIES || 'hd';
const GEN_FAST_MAX_CONCURRENCY = Number(process.env.GEN_FAST_MAX_CONCURRENCY || 0);
const GEN_FORCE_FAST_FOR_ALL = String(process.env.GEN_FORCE_FAST_FOR_ALL || '').toLowerCase() === 'true';
const GEN_FAST_CHANNELS = process.env.GEN_FAST_CHANNELS || '';
const DEFAULT_MODEL = process.env.VITE_OPENAI_IMAGE_MODEL || 'gpt-image-2';
const DEFAULT_SIZE = process.env.VITE_OPENAI_IMAGE_SIZE || '1024x1024';
const DEFAULT_QUALITY = process.env.GEN_DEFAULT_QUALITY || 'medium';
const QUEUE_WORKERS = Number(process.env.GEN_QUEUE_WORKERS || 2);
const QUEUE_CONCURRENCY = Number(process.env.GEN_QUEUE_CONCURRENCY || 3);
const QUEUE_GAP_MS = Number(process.env.GEN_QUEUE_GAP_MS || 0);
const REMOTE_SYNC_ENABLED = String(process.env.REMOTE_SYNC_ENABLED || '').toLowerCase() === 'true';
const REMOTE_SYNC_BASE_URL = (process.env.REMOTE_SYNC_BASE_URL || '').trim();
const REMOTE_SYNC_USER_ID = (process.env.REMOTE_SYNC_USER_ID || '').trim();
const REMOTE_SYNC_POLL_MS = Number(process.env.REMOTE_SYNC_POLL_MS || 12000);
const REMOTE_SYNC_BATCH_SIZE = Number(process.env.REMOTE_SYNC_BATCH_SIZE || 2);
const HEARTBEAT_ENABLED = String(process.env.HEARTBEAT_ENABLED || '').toLowerCase() === 'true';
const HEARTBEAT_INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS || 15 * 60 * 1000);
const HEARTBEAT_BATCH_SIZE = Number(process.env.HEARTBEAT_BATCH_SIZE || 12);
const HEARTBEAT_CATEGORY_TARGET = Number(process.env.HEARTBEAT_CATEGORY_TARGET || 120);
const HEARTBEAT_MAX_BACKFILL_CATEGORIES = Number(process.env.HEARTBEAT_MAX_BACKFILL_CATEGORIES || 6);
const HEARTBEAT_DEEPSEEK_API_KEY = (process.env.HEARTBEAT_DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim();
const HEARTBEAT_DEEPSEEK_BASE_URL = (process.env.HEARTBEAT_DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').trim();
const HEARTBEAT_DEEPSEEK_MODEL = (process.env.HEARTBEAT_DEEPSEEK_MODEL || process.env.DEEPSEEK_TAG_MODEL || 'deepseek-chat').trim();
const HEARTBEAT_CHANNEL_DISTRIBUTION = (process.env.HEARTBEAT_CHANNEL_DISTRIBUTION || '').trim();
const HEARTBEAT_INCLUDE_SLOW = String(process.env.HEARTBEAT_INCLUDE_SLOW || 'true').toLowerCase() !== 'false';
const EDITOR_BATCH_ENABLED = String(process.env.EDITOR_BATCH_ENABLED || '').toLowerCase() === 'true';
const EDITOR_BATCH_INTERVAL_MS = Number(process.env.EDITOR_BATCH_INTERVAL_MS || 30 * 60 * 1000);
const EDITOR_BATCH_SIZE = Number(process.env.EDITOR_BATCH_SIZE || 12);
const EDITOR_BATCH_DEEPSEEK_API_KEY = (process.env.EDITOR_BATCH_DEEPSEEK_API_KEY || HEARTBEAT_DEEPSEEK_API_KEY || '').trim();
const EDITOR_BATCH_DEEPSEEK_BASE_URL = (process.env.EDITOR_BATCH_DEEPSEEK_BASE_URL || HEARTBEAT_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').trim();
const EDITOR_BATCH_DEEPSEEK_MODEL = (process.env.EDITOR_BATCH_DEEPSEEK_MODEL || HEARTBEAT_DEEPSEEK_MODEL || 'deepseek-chat').trim();

function parseModelApiKeys(raw) {
  if (!String(raw || '').trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([model, key]) => [String(model).trim(), String(key || '').trim()])
        .filter(([model, key]) => model && key),
    );
  } catch {
    console.warn('[image-model-keys] invalid OPENAI_IMAGE_MODEL_KEYS JSON');
    return {};
  }
}

const worker = startGenQueueWorker({
  baseUrl: OPENAI_BASE_URL,
  apiKey: OPENAI_API_KEY,
  apiKeysByModel: parseModelApiKeys(OPENAI_IMAGE_MODEL_KEYS),
  fastChannelsRaw: GEN_FAST_CHANNELS,
  fastBaseUrl: GEN_FAST_API_BASE_URL,
  fastBaseUrlCn: GEN_FAST_API_BASE_URL_CN,
  fastApiPath: GEN_FAST_API_PATH,
  fastResultPath: GEN_FAST_RESULT_PATH,
  fastApiKey: GEN_FAST_API_KEY,
  fastReplyType: GEN_FAST_REPLY_TYPE,
  fastModels: GEN_FAST_MODELS,
  fastQualities: GEN_FAST_QUALITIES,
  fastMaxConcurrency: GEN_FAST_MAX_CONCURRENCY,
  forceFastForAll: GEN_FORCE_FAST_FOR_ALL,
  workerCount: QUEUE_WORKERS,
  concurrency: QUEUE_CONCURRENCY,
  pollIntervalMs: 1000,
  gapBetweenJobsMs: Math.max(0, QUEUE_GAP_MS),
  staleAfterMs: 3 * 60 * 1000,
  logger: console,
});

const remoteSyncWorker = startRemoteSyncWorker({
  enabled: REMOTE_SYNC_ENABLED,
  remoteBaseUrl: REMOTE_SYNC_BASE_URL,
  remoteUserId: REMOTE_SYNC_USER_ID,
  pollIntervalMs: REMOTE_SYNC_POLL_MS,
  batchSize: REMOTE_SYNC_BATCH_SIZE,
  logger: console,
});

const heartbeatWorker = startHeartbeatWorker({
  enabled: HEARTBEAT_ENABLED,
  intervalMs: HEARTBEAT_INTERVAL_MS,
  batchSize: HEARTBEAT_BATCH_SIZE,
  categoryTarget: HEARTBEAT_CATEGORY_TARGET,
  maxBackfillCategories: HEARTBEAT_MAX_BACKFILL_CATEGORIES,
  deepseekApiKey: HEARTBEAT_DEEPSEEK_API_KEY,
  deepseekBaseUrl: HEARTBEAT_DEEPSEEK_BASE_URL,
  deepseekModel: HEARTBEAT_DEEPSEEK_MODEL,
  defaultModel: DEFAULT_MODEL,
  defaultSize: DEFAULT_SIZE,
  defaultQuality: DEFAULT_QUALITY,
  fastChannelsRaw: GEN_FAST_CHANNELS,
  channelDistributionRaw: HEARTBEAT_CHANNEL_DISTRIBUTION,
  slowEnabled: Boolean(OPENAI_API_KEY && OPENAI_BASE_URL),
  includeSlowChannel: HEARTBEAT_INCLUDE_SLOW,
  logger: console,
});

const editorBatchWorker = startEditorBatchWorker({
  deepseekApiKey: EDITOR_BATCH_DEEPSEEK_API_KEY,
  deepseekBaseUrl: EDITOR_BATCH_DEEPSEEK_BASE_URL,
  deepseekModel: EDITOR_BATCH_DEEPSEEK_MODEL,
  defaultModel: DEFAULT_MODEL,
  defaultSize: DEFAULT_SIZE,
  defaultQuality: DEFAULT_QUALITY,
  fastChannelsRaw: GEN_FAST_CHANNELS,
  enabled: EDITOR_BATCH_ENABLED,
  intervalMs: EDITOR_BATCH_INTERVAL_MS,
  batchSize: EDITOR_BATCH_SIZE,
  logger: console,
});

async function stopAll() {
  worker.stop();
  await worker.wait();
  remoteSyncWorker.stop();
  await remoteSyncWorker.wait();
  heartbeatWorker.stop();
  await heartbeatWorker.wait();
  editorBatchWorker.stop();
  await editorBatchWorker.wait();
}

process.on('SIGINT', async () => {
  await stopAll();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await stopAll();
  process.exit(0);
});

console.log('[worker] Lovioa background workers started');
