import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import {
  listPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
  toggleLike,
  toggleSave,
  listHistory,
  getHistoryById,
  addHistory,
  deleteHistory,
  getStats,
  createUser,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  enqueueGenJob,
  getGenJobById,
  listGenJobs,
  requeueGenJob,
  cancelGenJob,
  markGenJobSucceeded,
  markGenJobFailed,
  listGenHistoryForModeration,
  approveHistory,
  rejectHistory,
  createContentModerationCheck,
  listContentModerationChecks,
  updateContentModerationCheck,
  listModerationChecks,
  approveModerationCheck,
  rejectModerationCheck,
  getUserBilling,
  getUserBalance,
  ensureUserBalance,
  getSubscriptionByUserId,
  createSubscription,
  updateSubscriptionStatus,
  cancelSubscriptionByUserId,
  addCredits,
  claimDailyLoginReward,
  getTotalCredits,
  deductCredit,
  isWebhookEventProcessed,
  markWebhookEventProcessed,
  createPasswordResetToken,
  consumePasswordResetToken,
  updateUserPasswordHash,
  saveOnboardingData,
  listPromptRowsForTagging,
  applyPromptTagging,
  countPromptRowsForTagging,
  listHeartbeatRuns,
  getHeartbeatStats,
  refreshHeartbeatRunFromJobs,
  summarizeHeartbeatRunJobs,
  trackEvent,
  getAnalyticsStats,
  createAdminAccount,
  getAdminAccountById,
  getAdminAccountByUsername,
  updateAdminPasswordHash,
  createAdminSession,
  getAdminSessionByToken,
  updateAdminSessionExpiryByToken,
  deleteAdminSessionByToken,
  deleteAdminSessionsByAdminId,
  cleanExpiredAdminSessions,
  createUserSession,
  getUserSessionByToken,
  updateUserSessionExpiryByToken,
  deleteUserSessionByToken,
  deleteUserSessionsByUserId,
  cleanExpiredUserSessions,
  // Editor batch functions
  advanceEditorItemFromStep1,
  advanceEditorItemFromStep2,
  markEditorItemStep1Failed,
  markEditorItemStep2Failed,
  getEditorBatchById,
  getEditorShowcaseItems,
} from './db/promptsRepo.js';
import { db, rowToPrompt } from './db/promptsRepo.js';
import {
  listUsers,
  listPromptsAdmin,
  listGenJobsAdmin,
  logAdminAction,
  listAdminLogs,
  getUserStats,
  updateUserAdmin,
  deleteUser,
} from './db/promptsRepo.js';
import { startGenQueueWorker } from './services/genQueueWorker.js';
import { startRemoteSyncWorker } from './services/remoteSyncWorker.js';
import { startHeartbeatWorker } from './services/heartbeatWorker.js';
import { startEditorBatchWorker } from './services/editorBatchWorker.js';
import { sendPasswordResetEmail } from './services/emailService.js';
import { err, detectLang } from './i18n/index.js';
import { uploadBuffer, isStorageConfigured, resolveImageUrl } from './services/cloudStorage.js';
import { tagPromptsInParallel } from './services/taggingService.js';
import { resolveGeoLocationFromRequest } from './services/geoip.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const SALT_ROUNDS = 12;

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

const PORT = Number(process.env.PORT || 3001);
const APP_BASE_URL = String(process.env.APP_BASE_URL || '').trim();
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
const START_WORKERS = String(process.env.RUN_WORKERS || 'true').toLowerCase() !== 'false';
const PASSWORD_RESET_TTL_MINUTES = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 30);
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const REMOTE_SYNC_ENABLED = String(process.env.REMOTE_SYNC_ENABLED || '').toLowerCase() === 'true';
const REMOTE_SYNC_BASE_URL = (process.env.REMOTE_SYNC_BASE_URL || '').trim();
const REMOTE_SYNC_USER_ID = (process.env.REMOTE_SYNC_USER_ID || '').trim();
const REMOTE_SYNC_SECRET = (process.env.REMOTE_SYNC_SECRET || '').trim();
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
const ADMIN_SESSION_TTL_DAYS = Math.max(1, Number(process.env.ADMIN_SESSION_TTL_DAYS || 30));
const USER_SESSION_TTL_DAYS = Math.max(1, Number(process.env.USER_SESSION_TTL_DAYS || 30));

// ── Editor Batch Worker ────────────────────────────────────────────────────────
const EDITOR_BATCH_ENABLED = String(process.env.EDITOR_BATCH_ENABLED || '').toLowerCase() === 'true';
const EDITOR_BATCH_INTERVAL_MS = Number(process.env.EDITOR_BATCH_INTERVAL_MS || 30 * 60 * 1000);
const EDITOR_BATCH_SIZE = Number(process.env.EDITOR_BATCH_SIZE || 12);
// DeepSeek config for editor batch (falls back to HEARTBEAT_* if not set)
const EDITOR_BATCH_DEEPSEEK_API_KEY = (process.env.EDITOR_BATCH_DEEPSEEK_API_KEY || HEARTBEAT_DEEPSEEK_API_KEY || '').trim();
const EDITOR_BATCH_DEEPSEEK_BASE_URL = (process.env.EDITOR_BATCH_DEEPSEEK_BASE_URL || HEARTBEAT_DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1').trim();
const EDITOR_BATCH_DEEPSEEK_MODEL = (process.env.EDITOR_BATCH_DEEPSEEK_MODEL || HEARTBEAT_DEEPSEEK_MODEL || 'deepseek-chat').trim();

const GEMINI_PRO_MODELS = new Set([
  'gemini-3-pro-image',
  'image-gemini-3-pro-image',
]);
const GEMINI_FLASH_MODELS = new Set(['gemini-3.1-flash-image']);
const GEMINI_PRO_ASPECT_RATIOS = new Set([
  '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9',
]);
const GEMINI_FLASH_ASPECT_RATIOS = new Set([
  '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3',
  '4:5', '5:4', '8:1', '9:16', '16:9', '21:9',
]);

function normalizeGenerationOptions(model, rawOptions) {
  const modelKey = String(model || '').trim().toLowerCase();
  if (!GEMINI_PRO_MODELS.has(modelKey) && !GEMINI_FLASH_MODELS.has(modelKey)) return {};

  const options = rawOptions && typeof rawOptions === 'object' ? rawOptions : {};
  const aspectRatios = GEMINI_FLASH_MODELS.has(modelKey)
    ? GEMINI_FLASH_ASPECT_RATIOS
    : GEMINI_PRO_ASPECT_RATIOS;
  const imageSizes = GEMINI_FLASH_MODELS.has(modelKey)
    ? new Set(['0.5K', '1K', '2K', '4K'])
    : new Set(['1K', '2K', '4K']);
  const aspectRatio = String(options.aspectRatio || '').trim();
  const imageSize = String(options.imageSize || '').trim().toUpperCase();

  return {
    provider: 'gemini',
    aspectRatio: aspectRatios.has(aspectRatio) ? aspectRatio : '1:1',
    imageSize: imageSizes.has(imageSize) ? imageSize : '1K',
  };
}

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

const IMAGE_MODEL_API_KEYS = parseModelApiKeys(OPENAI_IMAGE_MODEL_KEYS);

function openAiApiUrl(pathname) {
  const base = String(OPENAI_BASE_URL || '').trim().replace(/\/+$/, '');
  const versionedBase = /\/v1$/i.test(base) ? base : `${base}/v1`;
  const pathPart = String(pathname || '').startsWith('/') ? pathname : `/${pathname}`;
  return `${versionedBase}${pathPart}`;
}

const app = express();
const googleAuthClient = new OAuth2Client();
const FAST_QUALITIES_SET = new Set(
  String(GEN_FAST_QUALITIES || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean),
);
const FAST_MODELS_SET = new Set(
  String(GEN_FAST_MODELS || '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean),
);

function normalizeCsvSet(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

function parseFastChannels(raw) {
  let parsed = [];
  if (String(raw || '').trim()) {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) parsed = data;
    } catch (err2) {
      console.warn('[fast-channels] invalid GEN_FAST_CHANNELS JSON, fallback to legacy config');
    }
  }

  const fallback = [{
    name: 'legacy-fast',
    baseUrl: GEN_FAST_API_BASE_URL,
    backupBaseUrl: GEN_FAST_API_BASE_URL_CN,
    apiPath: GEN_FAST_API_PATH,
    resultPath: GEN_FAST_RESULT_PATH,
    apiKey: GEN_FAST_API_KEY,
    replyType: GEN_FAST_REPLY_TYPE,
    models: GEN_FAST_MODELS,
    qualities: GEN_FAST_QUALITIES,
    forceFastForAll: GEN_FORCE_FAST_FOR_ALL,
    enabled: true,
  }];

  const source = parsed.length > 0 ? parsed : fallback;

  const channels = source.map((ch, idx) => {
    const bases = [
      ...(Array.isArray(ch?.baseUrls) ? ch.baseUrls : []),
      ch?.baseUrl,
      ch?.baseUrlCn,
      ch?.backupBaseUrl,
      ch?.fallbackBaseUrl,
    ]
      .map((v) => String(v || '').trim().replace(/\/+$/, ''))
      .filter(Boolean);

    const apiKey = String(ch?.apiKey ?? GEN_FAST_API_KEY ?? '').trim();
    const enabled = ch?.enabled === undefined ? true : Boolean(ch.enabled);
    return {
      name: String(ch?.name || `fast-${idx + 1}`),
      enabled,
      apiKey,
      apiPath: String(ch?.apiPath || GEN_FAST_API_PATH || '/v1/api/generate').trim(),
      resultPath: String(ch?.resultPath || GEN_FAST_RESULT_PATH || '/v1/api/result').trim(),
      replyType: String(ch?.replyType || GEN_FAST_REPLY_TYPE || 'json').trim(),
      bases: [...new Set(bases)],
      models: normalizeCsvSet(ch?.models ?? GEN_FAST_MODELS),
      qualities: normalizeCsvSet(ch?.qualities ?? GEN_FAST_QUALITIES),
      forceFastForAll: ch?.forceFastForAll === undefined
        ? GEN_FORCE_FAST_FOR_ALL
        : Boolean(ch.forceFastForAll),
    };
  }).filter((c) => c.enabled && c.apiKey && c.bases.length > 0);

  return channels;
}

const FAST_CHANNELS = parseFastChannels(GEN_FAST_CHANNELS);
let FAST_CHANNEL_CURSOR = 0;

function listHeartbeatExpectedChannels() {
  const out = [];
  for (const ch of FAST_CHANNELS) {
    const bases = Array.isArray(ch?.bases) ? ch.bases : [];
    if (bases.length === 0) {
      out.push(String(ch?.name || '').trim());
      continue;
    }
    for (const base of bases) {
      out.push(`${String(ch?.name || '').trim()}@${String(base || '').trim().replace(/\/+$/, '')}`);
    }
  }
  if (HEARTBEAT_INCLUDE_SLOW && OPENAI_API_KEY && OPENAI_BASE_URL) out.push('slow');
  return [...new Set(out.filter(Boolean))];
}

function deriveUsernameFromGooglePayload(payload) {
  const emailLocal = String(payload?.email || '').split('@')[0] || 'google_user';
  const nameBase = String(payload?.name || '').trim().replace(/\s+/g, '_');
  const fallback = nameBase || emailLocal || `google_${String(payload?.sub || '').slice(-8)}`;
  const cleaned = fallback.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'google_user';
  return cleaned;
}

function makeUniqueUsername(base) {
  const seed = (base || 'google_user').slice(0, 24);
  if (!getUserByUsername(seed)) return seed;
  for (let i = 1; i <= 9999; i++) {
    const suffix = `_${i}`;
    const candidate = `${seed.slice(0, Math.max(2, 24 - suffix.length))}${suffix}`;
    if (!getUserByUsername(candidate)) return candidate;
  }
  return `google_${Date.now().toString().slice(-8)}`;
}

if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

// Cloud storage: generic S3-compatible storage if configured, otherwise R2/local disk
const S4_CONFIGURED = Boolean(process.env.S4_ENDPOINT && process.env.S4_ACCESS_KEY && process.env.S4_SECRET_KEY && process.env.S4_BUCKET_NAME);
const R2_CONFIGURED = Boolean(!S4_CONFIGURED && process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
const STORAGE_CONFIGURED = isStorageConfigured();

const storage = R2_CONFIGURED
  ? multer.memoryStorage()  // buffer → R2 directly
  : multer.diskStorage({
      destination: (req, file, cb) => cb(null, UPLOADS_DIR),
      filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname).toLowerCase() || '.jpg'}`),
    });
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

function pickFastImageUrl(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.url,
    payload.image,
    payload.image_url,
    payload.result?.url,
    payload.result?.image,
    payload.result?.image_url,
    payload.results?.[0]?.url,
    payload.results?.[0]?.image,
    payload.results?.[0]?.image_url,
    payload.data?.[0]?.url,
    payload.data?.[0]?.image,
    payload.data?.[0]?.image_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
  }
  const b64 = payload.b64_json
    || payload.image_base64
    || payload.result?.b64_json
    || payload.results?.[0]?.b64_json
    || payload.data?.[0]?.b64_json;
  if (typeof b64 === 'string' && b64.trim()) {
    return `data:image/png;base64,${b64}`;
  }
  return '';
}

function normalizePersistedImageUrl(imageUrl, fallbackPrefix = 'gen') {
  const value = String(imageUrl || '').trim();
  if (!value) return '';
  if (!value.startsWith('data:')) return value;
  const m = /^data:([^;]+);base64,(.+)$/i.exec(value);
  if (!m) return '';
  const mime = m[1] || 'image/png';
  const ext = mime.includes('jpeg') || mime.includes('jpg')
    ? 'jpg'
    : mime.includes('webp')
      ? 'webp'
      : mime.includes('gif')
        ? 'gif'
        : 'png';
  const fileName = `${fallbackPrefix}-${Date.now()}-${uuidv4()}.${ext}`;
  try {
    if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
    writeFileSync(path.join(UPLOADS_DIR, fileName), Buffer.from(m[2] || '', 'base64'));
    return `/uploads/${fileName}`;
  } catch (err) {
    console.warn('[image] failed to materialize data url:', err?.message || err);
    return '';
  }
}

async function persistGeneratedImageUrl(imageUrl, keyPrefix = 'generated') {
  const normalized = normalizePersistedImageUrl(imageUrl, keyPrefix);
  if (normalized) return normalized;
  if (!String(imageUrl || '').startsWith('data:')) return String(imageUrl || '').trim();
  return '';
}

function pickFastTaskId(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const id = payload.id || payload.task_id || payload.taskId || payload.result?.id;
  return typeof id === 'string' ? id : '';
}

function normalizeFastStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function channelMatchesRoute(channel, { model, quality }) {
  if (!channel) return false;
  if (channel.forceFastForAll || GEN_FORCE_FAST_FOR_ALL) return true;
  const modelKey = String(model || '').toLowerCase();
  const qualityKey = String(quality || '').toLowerCase();
  if (channel.models.size > 0 && channel.models.has(modelKey)) return true;
  if (channel.qualities.size > 0 && channel.qualities.has(qualityKey)) return true;
  if (FAST_MODELS_SET.size > 0 && FAST_MODELS_SET.has(modelKey)) return true;
  if (FAST_QUALITIES_SET.size > 0 && FAST_QUALITIES_SET.has(qualityKey)) return true;
  return false;
}

function orderedChannelsByRoundRobin(channels) {
  if (channels.length <= 1) return channels;
  const start = FAST_CHANNEL_CURSOR % channels.length;
  FAST_CHANNEL_CURSOR += 1;
  return channels.slice(start).concat(channels.slice(0, start));
}

function pickFastChannels(route) {
  const eligible = FAST_CHANNELS.filter((c) => channelMatchesRoute(c, route));
  return orderedChannelsByRoundRobin(eligible);
}

function shouldUseFastPath({ model, quality }) {
  return pickFastChannels({ model, quality }).length > 0;
}

function normalizeModerationDecision(decision) {
  const value = String(decision || '').trim().toLowerCase();
  if (value === 'allow' || value === 'pass' || value === 'approved' || value === 'ok') return 'pass';
  if (value === 'flag' || value === 'review' || value === 'manual') return 'block';
  if (value === 'deny' || value === 'block' || value === 'reject' || value === 'rejected') return 'block';
  return 'block';
}

const LOCAL_MODERATION_BLOCKLIST = [
  /\b(child\s*sexual|csam|minor\s*sexual|underage\s*sex)\b/i,
  /\b(rape|sexual\s*assault|incest)\b/i,
  /\b(bestiality|zoophilia|necrophilia)\b/i,
  /\b(self[-\s]?harm|suicide\s*method|kill\s*myself)\b/i,
  /\b(nazi\s*propaganda|terrorist\s*manual|bomb\s*tutorial)\b/i,
];

function localModerateText(text) {
  const normalized = String(text || '').trim();
  if (!normalized) {
    return {
      decision: 'block',
      providerDecision: 'flag',
      score: 0,
      reason: 'Missing text',
      labels: ['missing_text'],
      raw: { policy: 'local', matched: null },
    };
  }
  for (const re of LOCAL_MODERATION_BLOCKLIST) {
    if (re.test(normalized)) {
      return {
        decision: 'block',
        providerDecision: 'flag',
        score: 1,
        reason: `Matched local moderation rule: ${re}`,
        labels: ['policy_block'],
        raw: { policy: 'local', matched: String(re) },
      };
    }
  }
  return {
    decision: 'pass',
    providerDecision: 'allow',
    score: 0,
    reason: 'Passed local moderation rules',
    labels: [],
    raw: { policy: 'local', matched: null },
  };
}

async function runContentModeration({
  requestType = 'prompt',
  subjectType = 'prompt',
  subjectId = '',
  text = '',
  imageUrl = '',
  sourcePrompt = '',
  externalId = '',
}) {
  const normalizedText = String(text || sourcePrompt || '').trim();
  const moderation = localModerateText(normalizedText, { requestType, externalId });
  const decision = normalizeModerationDecision(moderation.decision);
  return createContentModerationCheck({
    requestType,
    subjectType,
    subjectId,
    textContent: normalizedText,
    imageUrl,
    sourcePrompt,
    providerName: 'local',
    providerDecision: moderation.providerDecision || moderation.decision || 'allow',
    decision,
    score: Number(moderation.score || 0),
    reason: moderation.reason || '',
    labels: moderation.labels || [],
    raw: moderation.raw || {},
  });
}

async function enforcePromptModeration({
  prompt,
  req,
  userId = null,
  mode = 'text',
  policyErrorKey = 'gen.promptRejectedByPolicy',
}) {
  const moderation = await runContentModeration({
    requestType: 'prompt',
    subjectType: 'prompt',
    subjectId: userId || '',
    text: prompt,
    externalId: userId ? `user_${userId}:mode_${mode}` : `guest:mode_${mode}`,
  });

  if (moderation.decision === 'block' || moderation.decision === 'review') {
    const blocked = new Error('moderation_blocked');
    blocked.status = 400;
    blocked.errorKey = policyErrorKey;
    blocked.decision = moderation.decision;
    throw blocked;
  }

  return moderation;
}

async function pollFastResult({ channel, taskId, signal, baseCandidates, maxAttempts = 90, intervalMs = 1200 }) {
  const bases = (Array.isArray(baseCandidates) ? baseCandidates : [])
    .map((v) => String(v || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (bases.length === 0) throw new Error('Fast provider base URL not configured');
  const pathPart = channel.resultPath.startsWith('/') ? channel.resultPath : `/${channel.resultPath}`;
  let lastError = null;
  for (let i = 0; i < maxAttempts; i++) {
    for (const base of bases) {
      try {
        const res = await fetch(`${base}${pathPart}?id=${encodeURIComponent(taskId)}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${channel.apiKey}`,
            'x-api-key': channel.apiKey,
            'Content-Type': 'application/json',
          },
          signal,
        });
        const text = await res.text();
        let payload = {};
        try { payload = JSON.parse(text); } catch {}
        if (!res.ok) {
          throw new Error(`Fast result HTTP ${res.status}: ${text.slice(0, 500)}`);
        }
        const imageUrl = pickFastImageUrl(payload);
        if (imageUrl) return imageUrl;
        const st = normalizeFastStatus(payload.status);
        if (st && ['failed', 'error', 'cancelled', 'canceled'].includes(st)) {
          throw new Error(`Fast provider job failed: ${st}`);
        }
      } catch (err) {
        lastError = err;
      }
    }
    if (i === maxAttempts - 1 && lastError) throw lastError;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Fast provider result timeout');
}

async function callFastProviderOnChannel(channel, { mode, model, size, prompt, negativePrompt, referenceImageUrl, signal }) {
  const bases = channel.bases || [];
  if (bases.length === 0) throw new Error('Fast provider base URL not configured');
  const pathPart = channel.apiPath.startsWith('/') ? channel.apiPath : `/${channel.apiPath}`;

  let lastError = null;

  // ── Edit mode: multipart/form-data ──────────────────────────────────────────
  const isEditMode = mode === 'edit' && referenceImageUrl;
  if (isEditMode) {
    let mimeType = 'image/png';
    let binaryData = null;

    if (referenceImageUrl.startsWith('data:')) {
      // Inline base64 data URI
      const match = referenceImageUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) throw new Error('Invalid data URI');
      mimeType = match[1];
      binaryData = Buffer.from(match[2], 'base64');
    } else if (referenceImageUrl.startsWith('/uploads/')) {
      // Local static-file path
      const fs = await import('fs');
      binaryData = fs.readFileSync(path.join(ROOT_DIR, referenceImageUrl));
    } else if (/^https?:\/\//i.test(referenceImageUrl)) {
      // Remote CDN URL → stream + convert to base64
      const imgRes = await fetch(referenceImageUrl, { signal });
      if (!imgRes.ok) throw new Error(`Failed to fetch reference image: ${imgRes.status}`);
      mimeType = imgRes.headers.get('Content-Type') || 'image/png';
      const buf = await imgRes.arrayBuffer();
      binaryData = Buffer.from(buf);
    } else {
      throw new Error('Unsupported reference image URL format');
    }

    for (const base of bases) {
      const form = new FormData();
      form.append('file', new Blob([binaryData], { type: mimeType }), 'ref.png');
      form.append('prompt', (negativePrompt ? `${prompt}\nAvoid: ${negativePrompt}` : prompt));
      form.append('model', model || DEFAULT_MODEL);
      form.append('aspectRatio', size || DEFAULT_SIZE);
      form.append('replyType', channel.replyType || 'json');

      try {
        const res = await fetch(`${base}${pathPart}`, {
          method: 'POST',
          headers: { 'x-api-key': channel.apiKey, ...form.getHeaders() },
          body: form,
          signal,
        });
        const text = await res.text();
        let data = {};
        try { data = JSON.parse(text); } catch {}
        if (!res.ok) throw new Error(`Fast provider HTTP ${res.status}: ${text.slice(0, 500)}`);
        const directUrl = pickFastImageUrl(data);
        if (directUrl) return directUrl;
        const taskId = pickFastTaskId(data);
        if (taskId) return pollFastResult({ channel, taskId, signal, baseCandidates: [base] });
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('All edit-mode bases failed');
  }

  // ── Text mode: JSON ─────────────────────────────────────────────────────────
  const payload = {
    model: model || DEFAULT_MODEL,
    prompt: negativePrompt ? `${prompt}\nAvoid: ${negativePrompt}` : prompt,
    aspectRatio: size || DEFAULT_SIZE,
    replyType: channel.replyType || 'json',
  };

  for (const base of bases) {
    try {
      const res = await fetch(`${base}${pathPart}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${channel.apiKey}`,
          'x-api-key': channel.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}
      if (!res.ok) {
        throw new Error(`Fast provider HTTP ${res.status}: ${text.slice(0, 500)}`);
      }
      const directUrl = pickFastImageUrl(data);
      if (directUrl) return directUrl;
      const taskId = pickFastTaskId(data);
      if (!taskId) throw new Error('Fast provider no image/task id');
      return pollFastResult({ channel, taskId, signal, baseCandidates: [base] });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Fast provider request failed');
}

async function callFastProviderDirect({ mode, model, size, quality, prompt, negativePrompt, referenceImageUrl, signal }) {
  const channels = pickFastChannels({ model, quality });
  if (channels.length === 0) throw new Error('Fast provider not configured for this route');

  let lastError = null;
  for (const channel of channels) {
    try {
      return await callFastProviderOnChannel(channel, {
        mode,
        model,
        size,
        prompt,
        negativePrompt,
        referenceImageUrl,
        signal,
      });
    } catch (err) {
      lastError = err;
      console.warn(`[fast-channel] ${channel.name} failed: ${err?.message || err}`);
    }
  }
  throw lastError || new Error('Fast provider request failed');
}

const corsAllowlist = new Set([
  APP_BASE_URL,
  process.env.ADMIN_BASE_URL || '',
  process.env.BASE_URL || '',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
].map((v) => String(v || '').trim().replace(/\/+$/, '')).filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const normalized = String(origin || '').trim().replace(/\/+$/, '');
    if (corsAllowlist.has(normalized)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));

function getRequestIpAddress(req) {
  return String(req.ip || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
}

function createUserSessionPayload(req, user) {
  const token = uuidv4();
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + USER_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const ipAddress = getRequestIpAddress(req);
  const userAgent = req.headers['user-agent'] || '';
  createUserSession({ id: sessionId, userId: user.id, token, expiresAt, ipAddress, userAgent });
  return token;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

function extractBearerToken(req) {
  const authHeader = String(req.headers.authorization || '').trim();
  if (!authHeader) return '';
  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token) return '';
  return scheme.toLowerCase() === 'bearer' ? token.trim() : '';
}

function getAuthenticatedUserFromRequest(req) {
  const token = extractBearerToken(req);
  if (!token) return null;
  const session = getUserSessionByToken(token);
  if (!session) return null;
  const nextExpiry = new Date(Date.now() + USER_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  updateUserSessionExpiryByToken(token, nextExpiry);
  return {
    token,
    user: {
      id: session.user_id,
      username: session.username,
      email: session.email,
      avatar: session.avatar,
      isAdmin: !!session.is_admin,
    },
  };
}

function requireAuth(req, res, next) {
  const auth = getAuthenticatedUserFromRequest(req);
  if (!auth) return res.status(401).json(err(req, 'auth.credentialsRequired'));
  req.currentUser = auth.user;
  req.userSession = auth;
  next();
}

function getCurrentUserOptional(req) {
  return getAuthenticatedUserFromRequest(req)?.user || null;
}

// ─── Auth ───────────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json(err(req, 'auth.usernameRequired'));
    }
    if (username.trim().length < 2) {
      return res.status(400).json(err(req, 'auth.usernameTooShort'));
    }
    if (password.length < 6) {
      return res.status(400).json(err(req, 'auth.passwordTooShort'));
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json(err(req, 'auth.emailInvalid'));
    }
    if (getUserByEmail(email.trim())) {
      return res.status(409).json(err(req, 'auth.emailExists'));
    }
    if (getUserByUsername(username.trim())) {
      return res.status(409).json(err(req, 'auth.usernameTaken'));
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username.trim())}&backgroundColor=B5622A&fontSize=40`;
    const user = createUser({ id: uuidv4(), username: username.trim(), email: email.trim().toLowerCase(), passwordHash, avatar });
    const token = createUserSessionPayload(req, user);
    res.status(201).json({
      token,
      user: sanitizeUser(user),
      signupReward: { credits: 6 },
    });
  } catch (err2) {
    if (err2.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json(err(req, 'auth.emailExists'));
    }
    console.error(err2);
    res.status(500).json(err(req, 'auth.registrationFailed'));
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim() || !password) {
      return res.status(400).json(err(req, 'auth.credentialsRequired'));
    }
    const user = getUserByEmail(email.trim());
    if (!user) {
      return res.status(401).json(err(req, 'auth.invalidCredentials'));
    }
    const valid = await bcrypt.compare(password, user.passwordHash || '');
    if (!valid) {
      return res.status(401).json(err(req, 'auth.invalidCredentials'));
    }
    const token = createUserSessionPayload(req, user);
    const dailyReward = claimDailyLoginReward(user.id);
    res.json({ token, user: sanitizeUser(user), dailyReward });
  } catch (err2) {
    console.error(err2);
    res.status(500).json(err(req, 'auth.loginFailed'));
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const dailyReward = claimDailyLoginReward(req.currentUser.id);
  res.json({ user: sanitizeUser(req.currentUser), dailyReward });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(503).json(err(req, 'auth.googleNotConfigured'));
    }

    const { idToken } = req.body || {};
    if (!idToken?.trim()) {
      return res.status(400).json(err(req, 'auth.googleIdTokenRequired'));
    }

    const ticket = await googleAuthClient.verifyIdToken({
      idToken: idToken.trim(),
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      return res.status(401).json(err(req, 'auth.googleTokenInvalid'));
    }
    if (payload.email_verified === false) {
      return res.status(401).json(err(req, 'auth.googleEmailNotVerified'));
    }

    const email = String(payload.email).toLowerCase();
    let user = getUserByEmail(email);
    const isNewUser = !user;

    if (!user) {
      const baseUsername = deriveUsernameFromGooglePayload(payload);
      const username = makeUniqueUsername(baseUsername);
      const passwordHash = await bcrypt.hash(uuidv4(), SALT_ROUNDS);
      const avatar = payload.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}&backgroundColor=B5622A&fontSize=40`;
      user = createUser({
        id: uuidv4(),
        username,
        email,
        passwordHash,
        avatar,
      });
    }

    const token = createUserSessionPayload(req, user);
    const dailyReward = isNewUser ? { granted: false, credits: 0 } : claimDailyLoginReward(user.id);
    return res.json({ token, user: sanitizeUser(user), dailyReward });
  } catch (err2) {
    console.error('[auth] google login failed:', err2);
    return res.status(401).json(err(req, 'auth.googleTokenInvalid'));
  }
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  try {
    const token = extractBearerToken(req);
    if (token) deleteUserSessionByToken(token);
    res.json({ success: true });
  } catch (err2) {
    console.error('[auth] logout error:', err2);
    res.status(500).json(err(req, 'common.internalError'));
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email?.trim()) {
      return res.status(400).json(err(req, 'auth.emailRequired'));
    }
    const user = getUserByEmail(email.trim().toLowerCase());
    if (!user) {
      return res.json({ success: true });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    createPasswordResetToken({ userId: user.id, token: rawToken, ttlMinutes: PASSWORD_RESET_TTL_MINUTES });

    const origin = req.headers.origin || APP_BASE_URL || BASE_URL;
    const resetUrl = `${origin.replace(/\/$/, '')}/auth?mode=reset&token=${encodeURIComponent(rawToken)}`;
    await sendPasswordResetEmail({
      to: user.email,
      username: user.username,
      resetUrl,
      expiresMinutes: PASSWORD_RESET_TTL_MINUTES,
    });
    return res.json({ success: true });
  } catch (err2) {
    console.error('[auth] forgot-password error:', err2);
    return res.status(500).json(err(req, 'auth.resetRequestFailed'));
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token?.trim() || !password) {
      return res.status(400).json(err(req, 'auth.resetTokenAndPasswordRequired'));
    }
    if (password.length < 6) {
      return res.status(400).json(err(req, 'auth.passwordTooShort'));
    }

    const userId = consumePasswordResetToken(token.trim());
    if (!userId) {
      return res.status(400).json(err(req, 'auth.invalidOrExpiredResetToken'));
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    updateUserPasswordHash(userId, passwordHash);
    deleteUserSessionsByUserId(userId);
    return res.json({ success: true });
  } catch (err2) {
    console.error('[auth] reset-password error:', err2);
    return res.status(500).json(err(req, 'auth.resetFailed'));
  }
});

// ─── Stats ──────────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  try { res.json(getStats()); } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// ─── Users ──────────────────────────────────────────────────────────────────
app.get('/api/users/:id', (req, res) => {
  try {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json(err(req, 'auth.userNotFound'));
    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.get('/api/users/:id/prompts', (req, res) => {
  try {
    const prompts = listPrompts({ authorUserId: req.params.id });
    res.json({ prompts, total: prompts.length });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.post('/api/users/onboarding', requireAuth, (req, res) => {
  try {
    const { source = [], role = '', useCase = [] } = req.body || {};
    const completedAt = new Date().toISOString();
    saveOnboardingData(req.currentUser.id, { source, role, useCase, completedAt });
    res.json({ ok: true, completedAt });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// ─── Prompts ────────────────────────────────────────────────────────────────
app.get('/api/prompts', (req, res) => {
  try {
    const { category, search, sort } = req.query;
    const limit = Number(req.query.limit || 120);
    const offset = Number(req.query.offset || 0);
    const prompts = listPrompts({ category, search, sort, limit, offset });
    const total = db.prepare(`
      SELECT COUNT(1) AS c
      FROM prompts
      ${(() => {
        const where = [];
        if (category && category !== 'Latest' && category !== 'Popular' && category !== 'Generated') {
          where.push(`category = ${JSON.stringify(String(category))}`);
        }
        if (search && String(search).trim()) {
          const q = `%${String(search).toLowerCase()}%`;
          where.push(`(LOWER(prompt) LIKE ${JSON.stringify(q)} OR LOWER(tags_json) LIKE ${JSON.stringify(q)} OR LOWER(category) LIKE ${JSON.stringify(q)} OR LOWER(author_name) LIKE ${JSON.stringify(q)})`);
        }
        return where.length ? `WHERE ${where.join(' AND ')}` : '';
      })()}
    `).get().c || 0;
    res.json({ prompts, total, limit, offset });
  } catch (err2) {
    console.error('[api/prompts] error:', err2);
    res.status(500).json(err(req, 'common.internalError'));
  }
});

app.get('/api/prompts/:id', (req, res) => {
  try {
    const prompt = getPromptById(req.params.id);
    if (!prompt) return res.status(404).json(err(req, 'prompt.notFound'));
    res.json(prompt);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// ─── Editor Showcase ─────────────────────────────────────────────────────────
app.get('/api/editor/showcase', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 60);
    const items = getEditorShowcaseItems({ limit });
    res.json({ items, total: items.length });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// ─── Generated Images ────────────────────────────────────────────────────────
app.get('/api/generated-images', (req, res) => {
  try {
    // Backward-compatible alias: unified source is /api/prompts.
    const { category, search, sort } = req.query;
    const prompts = listPrompts({ category, search, sort });
    res.json({ prompts, total: prompts.length });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

function canEditPrompt(currentUser, prompt) {
  if (!currentUser || !prompt) return false;
  if (currentUser.isAdmin) return true;
  return String(prompt.author?.userId || '') === String(currentUser.id || '');
}

app.post('/api/prompts', requireAuth, (req, res) => {
  try {
    const { imageUrl, prompt, tags, category } = req.body;
    if (!prompt?.trim() || prompt.trim().length < 10) {
      return res.status(400).json(err(req, 'prompt.required'));
    }
    const newPrompt = {
      id: uuidv4(),
      imageUrl: normalizePersistedImageUrl(imageUrl, 'prompt'),
      prompt: prompt.trim(),
      author: {
        name: req.currentUser.username || 'Anonymous',
        avatar: req.currentUser.avatar || '',
        promptCount: 0,
        userId: req.currentUser.id,
      },
      tags: Array.isArray(tags) ? tags : [],
      category: category || 'Portrait',
      likes: 0,
      liked: false,
      saved: false,
      createdAt: new Date().toISOString().split('T')[0],
    };
    res.status(201).json(createPrompt(newPrompt));
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.put('/api/prompts/:id', requireAuth, (req, res) => {
  try {
    const existing = getPromptById(req.params.id);
    if (!existing) return res.status(404).json(err(req, 'prompt.notFound'));
    if (!canEditPrompt(req.currentUser, existing)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { imageUrl, prompt, tags, category } = req.body;
    const updates = {};
    if (imageUrl !== undefined) updates.imageUrl = normalizePersistedImageUrl(imageUrl, 'prompt');
    if (prompt !== undefined) {
      if (!prompt?.trim() || prompt.trim().length < 10) {
        return res.status(400).json(err(req, 'prompt.required'));
      }
      updates.prompt = prompt.trim();
    }
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags : [];
    if (category !== undefined) updates.category = category;
    const updated = updatePrompt(req.params.id, updates);
    res.json(updated);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.post('/api/prompts/:id/like', (req, res) => {
  try {
    const updated = toggleLike(req.params.id);
    if (!updated) return res.status(404).json(err(req, 'prompt.notFound'));
    res.json(updated);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.post('/api/prompts/:id/save', (req, res) => {
  try {
    const updated = toggleSave(req.params.id);
    if (!updated) return res.status(404).json(err(req, 'prompt.notFound'));
    res.json(updated);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.delete('/api/prompts/:id', requireAuth, (req, res) => {
  try {
    const existing = getPromptById(req.params.id);
    if (!existing) return res.status(404).json(err(req, 'prompt.notFound'));
    if (!canEditPrompt(req.currentUser, existing)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const ok = deletePrompt(req.params.id);
    if (!ok) return res.status(404).json(err(req, 'prompt.notFound'));
    res.json({ success: true });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// ─── Upload ─────────────────────────────────────────────────────────────────
app.post('/api/upload', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json(err(req, 'upload.noFile'));

  try {
    let url;
    if (STORAGE_CONFIGURED) {
      // Stream buffer directly to R2 → return CDN URL
      const key = `uploads/${req.file.filename}`;
      url = await uploadBuffer(req.file.buffer, key, req.file.mimetype);
    } else {
      // Legacy: serve from local disk (backward compatible)
      url = `/uploads/${req.file.filename}`;
    }
    res.json({ url });
  } catch (err2) {
    console.error('[upload] error:', err2);
    res.status(500).json(err(req, 'upload.failed'));
  }
});

// ─── Generation Queue ───────────────────────────────────────────────────────
app.post('/api/gen/jobs', requireAuth, async (req, res) => {
  try {
    const {
      mode = 'text',
      model = DEFAULT_MODEL,
      size = DEFAULT_SIZE,
      quality = DEFAULT_QUALITY,
      generationOptions = {},
      prompt,
      negativePrompt = '',
      referenceImageUrl = null,
      editStrength = null,
      maxAttempts = 3,
      publishToPrompts,
      category = '',
    } = req.body || {};

    if (!prompt?.trim()) return res.status(400).json(err(req, 'gen.promptRequired'));

    const currentUser = req.currentUser;
    const effectiveUserId = currentUser.id;
    const requestedPublish = typeof publishToPrompts === 'boolean' ? publishToPrompts : false;
    const effectivePublishToPrompts = currentUser?.isAdmin ? requestedPublish : false;

    const normalizedPrompt = prompt.trim();
    const normalizedCategory = String(category || '').trim();
    const normalizedGenerationOptions = normalizeGenerationOptions(model, generationOptions);
    // Screen prompts before any generation execution.
    try {
      await enforcePromptModeration({
        prompt: normalizedPrompt,
        req,
        userId: effectiveUserId,
        mode,
      });
    } catch (modErr) {
      if (modErr?.errorKey) {
        return res.status(modErr.status || 400).json(err(req, modErr.errorKey));
      }
      console.error('[moderation] prompt screening failed:', modErr);
      return res.status(503).json(err(req, 'gen.moderationUnavailable'));
    }

    const isFastPath = shouldUseFastPath({ model, quality });
    const job = enqueueGenJob({
      userId: effectiveUserId,
      mode,
      model,
      size,
      quality,
      generationOptions: normalizedGenerationOptions,
      prompt: normalizedPrompt,
      negativePrompt,
      referenceImageUrl,
      editStrength,
      maxAttempts: isFastPath ? 1 : maxAttempts,
      publishToPrompts: effectivePublishToPrompts,
      initialStatus: isFastPath ? 'fast_running' : 'queued',
    });

    if (isFastPath) {
      setImmediate(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180_000);
        try {
          let imageUrl = await callFastProviderDirect({
            mode,
            model,
            size,
            quality,
            prompt: normalizedPrompt,
            negativePrompt,
            referenceImageUrl,
            signal: controller.signal,
          });
          // Persist fast-path images to our own storage so history links do not expire.
          if (STORAGE_CONFIGURED && imageUrl && imageUrl.trim()) {
            try {
              imageUrl = await resolveImageUrl(imageUrl, `generated/${job.id}_${uuidv4()}.png`);
            } catch (uploadErr) {
              console.warn(`[fast-path] storage upload failed for job=${job.id}:`, uploadErr?.message || uploadErr);
              // Do NOT fall back to the original URL if it looks like a transient failure.
              // Keep the original URL so the job record reflects reality.
              if (!imageUrl.startsWith('http') && !imageUrl.startsWith('data:')) imageUrl = '';
            }
          }
          imageUrl = await persistGeneratedImageUrl(imageUrl, `gen-${job.id}`);

          if (!imageUrl || !imageUrl.trim()) {
            const reason = 'Fast generation returned empty image URL';
            console.error(`[fast-path] job=${job.id} empty result: ${imageUrl}`);
            markGenJobFailed(job.id, reason);
            return;
          }

          markGenJobSucceeded(job.id, imageUrl);
          addHistory({
            imageUrl,
            prompt: normalizedPrompt,
            model,
            mode,
            userId: effectiveUserId,
            jobId: job.id,
            category: normalizedCategory,
            publishToPrompts: effectivePublishToPrompts,
          });
        } catch (fastErr) {
          const reason = String(fastErr?.message || 'Fast generation failed');
          markGenJobFailed(job.id, reason);
        } finally {
          clearTimeout(timeoutId);
        }
      });
    }

    res.status(201).json(job);
  } catch (err2) {
    if (String(err2.message || err2) === 'INSUFFICIENT_CREDITS') {
      return res.status(402).json(err(req, 'billing.creditsRequired'));
    }
    res.status(500).json(err(req, 'gen.enqueueFailed'));
  }
});

app.get('/api/gen/jobs', (req, res) => {
  try {
    const currentUser = getCurrentUserOptional(req);
    if (!currentUser) return res.status(401).json(err(req, 'auth.credentialsRequired'));
    const { status, userId, limit } = req.query;
    const scopedUserId = currentUser.isAdmin
      ? (userId ? String(userId) : undefined)
      : currentUser.id;
    const jobs = listGenJobs({ status, userId: scopedUserId, limit: Number(limit || 50) });
    res.json({ jobs, total: jobs.length });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.get('/api/gen/jobs/:id', (req, res) => {
  try {
    const currentUser = getCurrentUserOptional(req);
    if (!currentUser) return res.status(401).json(err(req, 'auth.credentialsRequired'));
    const job = getGenJobById(req.params.id);
    if (!job) return res.status(404).json(err(req, 'gen.jobNotFound'));
    if (!currentUser.isAdmin && String(job.userId || '') !== String(currentUser.id)) {
      return res.status(404).json(err(req, 'gen.jobNotFound'));
    }
    res.json(job);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.post('/api/gen/jobs/:id/requeue', (req, res) => {
  try {
    const currentUser = getCurrentUserOptional(req);
    if (!currentUser) return res.status(401).json(err(req, 'auth.credentialsRequired'));
    const existing = getGenJobById(req.params.id);
    if (!existing) return res.status(404).json(err(req, 'gen.jobNotFound'));
    if (!currentUser.isAdmin && String(existing.userId || '') !== String(currentUser.id)) {
      return res.status(404).json(err(req, 'gen.jobNotFound'));
    }
    const job = requeueGenJob(req.params.id);
    if (!job) return res.status(404).json(err(req, 'gen.jobNotFound'));
    res.json(job);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.post('/api/gen/jobs/:id/cancel', (req, res) => {
  try {
    const currentUser = getCurrentUserOptional(req);
    if (!currentUser) return res.status(401).json(err(req, 'auth.credentialsRequired'));
    const existing = getGenJobById(req.params.id);
    if (!existing) return res.status(404).json(err(req, 'gen.jobNotFound'));
    if (!currentUser.isAdmin && String(existing.userId || '') !== String(currentUser.id)) {
      return res.status(404).json(err(req, 'gen.jobNotFound'));
    }
    const job = cancelGenJob(req.params.id);
    if (!job) return res.status(404).json(err(req, 'gen.jobNotFound'));
    res.json(job);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// POST /api/moderation/check — unified content moderation check
app.post('/api/moderation/check', async (req, res) => {
  try {
    const {
      type = 'prompt',
      text = '',
      prompt = '',
      imageUrl = '',
      sourcePrompt = '',
      subjectType = '',
      subjectId = '',
    } = req.body || {};

    const normalizedType = String(type || 'prompt').toLowerCase() === 'image' ? 'image' : 'prompt';
    const payloadText = String(text || prompt || sourcePrompt || '').trim();
    const check = await runContentModeration({
      requestType: normalizedType,
      subjectType: String(subjectType || (normalizedType === 'image' ? 'generated_image' : 'prompt')),
      subjectId: String(subjectId || ''),
      text: payloadText,
      imageUrl: String(imageUrl || ''),
      sourcePrompt: String(sourcePrompt || ''),
      externalId: String(subjectId || ''),
    });
    res.json(check);
  } catch (err2) {
    if (err2?.status === 503) {
      return res.status(503).json(err(req, err2.errorKey || 'gen.moderationUnavailable'));
    }
    console.error('[moderation/check] error:', err2);
    res.status(500).json(err(req, 'common.internalError'));
  }
});

// ─── Prompt Refinement ──────────────────────────────────────────────────────
app.post('/api/prompt/refine', async (req, res) => {
  try {
    const { prompt, mode = 'text' } = req.body || {};
    if (!prompt?.trim()) return res.status(400).json({ error: 'Prompt is required' });
    const normalizedPrompt = prompt.trim();
    const effectiveUserId = getCurrentUserOptional(req)?.id || null;

    try {
      await enforcePromptModeration({
        prompt: normalizedPrompt,
        req,
        userId: effectiveUserId,
        mode: `refine_${mode}`,
      });
    } catch (modErr) {
      if (modErr?.errorKey) {
        return res.status(modErr.status || 400).json(err(req, modErr.errorKey));
      }
      console.error('[moderation] prompt refine screening failed:', modErr);
      return res.status(503).json(err(req, 'gen.moderationUnavailable'));
    }

    if (!OPENAI_API_KEY) {
      return res.status(503).json({ error: 'AI service not configured' });
    }

    const systemPrompt = mode === 'retouch'
      ? '你是一个专业的 AI 修图指令工程师。用户给了一个模糊的修图需求，请把它润色成一个清晰的 AI 修图指令。描述：要保留什么、要改变什么、风格是什么。输出中文，简洁专业。'
      : 'You are a professional AI photography prompt engineer. The user gave a vague idea. Polish it into a detailed, professional AI image generation prompt in English. Include: subject, lighting, composition, style, camera settings, mood. Be specific and vivid.';

    const response = await fetch(openAiApiUrl('/chat/completions'), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: normalizedPrompt },
        ],
        max_tokens: 600,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[prompt/refine] OpenAI error:', errText);
      return res.status(502).json({ error: 'AI refine failed. Please try again.' });
    }

    const data = await response.json();
    const refinedPrompt = data.choices?.[0]?.message?.content?.trim();
    if (!refinedPrompt) return res.status(502).json({ error: 'AI returned empty result' });

    res.json({ refinedPrompt, originalPrompt: normalizedPrompt });
  } catch (err) {
    console.error('[prompt/refine]', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// ─── History ────────────────────────────────────────────────────────────────
app.get('/api/history', requireAuth, (req, res) => {
  try {
    const requestedUserId = req.query.userId ? String(req.query.userId) : '';
    if (requestedUserId && !req.currentUser.isAdmin && requestedUserId !== req.currentUser.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const history = req.currentUser.isAdmin
      ? listHistory(requestedUserId || undefined)
      : listHistory(req.currentUser.id);
    return res.json({ history });
  }
  catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.post('/api/history', requireAuth, (req, res) => {
  try {
    const { imageUrl, prompt, model, mode } = req.body;
    if (!imageUrl || !prompt) return res.status(400).json(err(req, 'history.fieldsRequired'));
    res.status(201).json(addHistory({
      imageUrl: normalizePersistedImageUrl(imageUrl, 'history'),
      prompt,
      model,
      mode,
      userId: req.currentUser.id,
      publishToPrompts: false,
    }));
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

function isValidRemoteSyncRequest(req) {
  const incoming = String(req.headers['x-remote-sync-secret'] || '').trim();
  if (!REMOTE_SYNC_SECRET || !incoming) return false;
  const expected = Buffer.from(REMOTE_SYNC_SECRET);
  const actual = Buffer.from(incoming);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

app.post('/api/internal/history-sync', (req, res) => {
  try {
    if (!isValidRemoteSyncRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { imageUrl, prompt, model, mode, jobId, category } = req.body || {};
    if (!imageUrl || !prompt) return res.status(400).json(err(req, 'history.fieldsRequired'));
    const history = addHistory({
      imageUrl: normalizePersistedImageUrl(imageUrl, 'history'),
      prompt,
      model,
      mode,
      userId: null,
      jobId: jobId || null,
      category: category || 'Generated',
      publishToPrompts: true,
    });
    return res.status(201).json(history);
  } catch (err2) {
    console.error('[remote-sync] internal history sync failed:', err2);
    return res.status(500).json(err(req, 'common.internalError'));
  }
});

app.delete('/api/history/:id', requireAuth, (req, res) => {
  try {
    const item = getHistoryById(req.params.id);
    if (!item) return res.status(404).json(err(req, 'history.notFound'));
    if (!req.currentUser.isAdmin && String(item.userId || '') !== String(req.currentUser.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    deleteHistory(req.params.id);
    res.json({ success: true });
  }
  catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// ─── Admin ──────────────────────────────────────────────────────────────────
// Middleware: require admin session token
function requireAdminAuth(req, res, next) {
  const token = req.headers['x-admin-session'];
  if (!token) return res.status(401).json(err(req, 'auth.credentialsRequired'));
  const session = getAdminSessionByToken(token);
  if (!session) return res.status(401).json(err(req, 'auth.invalidCredentials'));
  const nextExpiry = new Date(Date.now() + ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  updateAdminSessionExpiryByToken(token, nextExpiry);
  req.adminSession = session;
  req.currentUser = { id: session.admin_id, username: session.username, isAdmin: true };
  next();
}

// POST /api/admin/auth/login — admin login
app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json(err(req, 'auth.credentialsRequired'));
    }
    const admin = getAdminAccountByUsername(username.trim());
    if (!admin) {
      return res.status(401).json(err(req, 'auth.invalidCredentials'));
    }
    const valid = await bcrypt.compare(password, admin.password_hash || '');
    if (!valid) {
      return res.status(401).json(err(req, 'auth.invalidCredentials'));
    }
    const token = uuidv4();
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || '';
    const userAgent = req.headers['user-agent'] || '';
    createAdminSession({ id: sessionId, adminId: admin.id, token, expiresAt, ipAddress, userAgent });
    res.json({
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        displayName: admin.display_name,
        avatar: admin.avatar,
      },
    });
  } catch (err2) {
    console.error('[admin login]', err2);
    res.status(500).json(err(req, 'auth.loginFailed'));
  }
});

// POST /api/admin/auth/logout — admin logout
app.post('/api/admin/auth/logout', requireAdminAuth, (req, res) => {
  try {
    const token = req.headers['x-admin-session'];
    if (token) deleteAdminSessionByToken(token);
    res.json({ success: true });
  } catch (err2) {
    console.error('[admin logout]', err2);
    res.status(500).json(err(req, 'common.internalError'));
  }
});

// GET /api/admin/auth/me — get current admin session info
app.get('/api/admin/auth/me', (req, res) => {
  try {
    const token = req.headers['x-admin-session'];
    if (!token) return res.json({ authenticated: false });
    const session = getAdminSessionByToken(token);
    if (!session) return res.json({ authenticated: false });
    res.json({
      authenticated: true,
      admin: {
        id: session.admin_id,
        username: session.username,
        displayName: session.display_name,
        avatar: session.avatar,
      },
    });
  } catch (err2) {
    console.error('[admin me]', err2);
    res.status(500).json(err(req, 'common.internalError'));
  }
});

// ── Admin account management (for super-admin to create other admins) ─────────
// POST /api/admin/accounts — create new admin account (requires existing admin auth)
app.post('/api/admin/accounts', requireAdminAuth, async (req, res) => {
  try {
    const { username, password, displayName = '' } = req.body;
    if (!username?.trim() || !password) {
      return res.status(400).json(err(req, 'auth.credentialsRequired'));
    }
    const existing = getAdminAccountByUsername(username.trim());
    if (existing) {
      return res.status(409).json(err(req, 'users.emailTaken'));
    }
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const avatar = `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(username)}`;
    const admin = createAdminAccount({ id, username: username.trim(), passwordHash, displayName, avatar });
    logAdminAction({
      adminUserId: req.currentUser.id,
      adminUsername: req.currentUser.username,
      action: 'create_admin_account',
      targetUsername: username,
      details: { displayName },
    });
    res.status(201).json({ id: admin.id, username: admin.username, displayName: admin.display_name, avatar: admin.avatar });
  } catch (err2) {
    console.error('[create admin account]', err2);
    res.status(500).json(err(req, 'common.internalError'));
  }
});

// GET /api/admin/users  — list all users (paginated, sortable)
app.get('/api/admin/users', requireAdminAuth, (req, res) => {
  try {
    const { limit = 50, offset = 0, sort = 'newest' } = req.query;
    const result = listUsers({ limit: Number(limit), offset: Number(offset), sort });
    res.json(result);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// GET /api/admin/users/:id  — get single user with stats
app.get('/api/admin/users/:id', requireAdminAuth, (req, res) => {
  try {
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json(err(req, 'auth.userNotFound'));
    const { passwordHash: _, ...safeUser } = user;
    const stats = getUserStats(req.params.id);
    res.json({ ...safeUser, stats });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// PATCH /api/admin/users/:id  — update user (admin role only)
app.patch('/api/admin/users/:id', requireAdminAuth, (req, res) => {
  try {
    const { isAdmin } = req.body;
    if (isAdmin === undefined) return res.status(400).json(err(req, 'admin.fieldRequired'));
    // Prevent self-demotion
    if (req.params.id === req.currentUser.id && !isAdmin) {
      return res.status(400).json(err(req, 'admin.cannotDemoteSelf'));
    }
    const user = updateUserAdmin(req.params.id, { isAdmin: Boolean(isAdmin) });
    if (!user) return res.status(404).json(err(req, 'auth.userNotFound'));
    // Log action
    const action = isAdmin ? 'grant_admin' : 'revoke_admin';
    logAdminAction({
      adminUserId: req.currentUser.id,
      adminUsername: req.currentUser.username,
      action,
      targetUserId: user.id,
      targetUsername: user.username,
      details: { isAdmin: Boolean(isAdmin) },
    });
    const { passwordHash: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// DELETE /api/admin/users/:id  — delete user and all associated data
app.delete('/api/admin/users/:id', requireAdminAuth, (req, res) => {
  try {
    // Prevent self-deletion
    if (req.params.id === req.currentUser.id) {
      return res.status(400).json(err(req, 'admin.cannotDeleteSelf'));
    }
    const user = getUserById(req.params.id);
    if (!user) return res.status(404).json(err(req, 'auth.userNotFound'));
    const deletedUsername = user.username;
    deleteUser(req.params.id);
    // Log action
    logAdminAction({
      adminUserId: req.currentUser.id,
      adminUsername: req.currentUser.username,
      action: 'delete_user',
      targetUserId: req.params.id,
      targetUsername: deletedUsername,
      details: {},
    });
    res.json({ success: true, deletedId: req.params.id });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// GET /api/admin/prompts  — list all prompts (paginated, sortable, filterable)
app.get('/api/admin/prompts', requireAdminAuth, (req, res) => {
  try {
    const { limit = 50, offset = 0, sort = 'newest', category = '' } = req.query;
    const result = listPromptsAdmin({ limit: Number(limit), offset: Number(offset), sort, category });
    res.json(result);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// DELETE /api/admin/prompts/:id  — admin delete any prompt
app.delete('/api/admin/prompts/:id', requireAdminAuth, (req, res) => {
  try {
    const prompt = getPromptById(req.params.id);
    if (!prompt) return res.status(404).json(err(req, 'prompt.notFound'));
    deletePrompt(req.params.id);
    // Log action
    logAdminAction({
      adminUserId: req.currentUser.id,
      adminUsername: req.currentUser.username,
      action: 'delete_prompt',
      targetPromptId: req.params.id,
      details: { prompt: prompt.prompt?.slice(0, 100) },
    });
    res.json({ success: true });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// GET /api/admin/jobs  — list all generation jobs
app.get('/api/admin/jobs', requireAdminAuth, (req, res) => {
  try {
    const { limit = 50, offset = 0, status = '' } = req.query;
    const result = listGenJobsAdmin({ limit: Number(limit), offset: Number(offset), status });
    res.json(result);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.get('/api/admin/heartbeat/stats', requireAdminAuth, (req, res) => {
  try {
    const {
      sinceHours = 24,
      refreshRunId = '',
      successRateWarn = '',
      p90LatencyWarnMs = '',
      failedCountWarn = '',
      minSamplesForAlert = '',
    } = req.query || {};
    if (refreshRunId) refreshHeartbeatRunFromJobs(String(refreshRunId));
    const stats = getHeartbeatStats({
      sinceHours: Number(sinceHours || 24),
      expectedChannels: listHeartbeatExpectedChannels(),
      successRateWarn: successRateWarn === '' ? undefined : Number(successRateWarn),
      p90LatencyWarnMs: p90LatencyWarnMs === '' ? undefined : Number(p90LatencyWarnMs),
      failedCountWarn: failedCountWarn === '' ? undefined : Number(failedCountWarn),
      minSamplesForAlert: minSamplesForAlert === '' ? undefined : Number(minSamplesForAlert),
    });
    res.json(stats);
  } catch (err2) { res.status(500).json({ error: err2.message || 'Heartbeat stats failed' }); }
});

app.get('/api/admin/heartbeat/runs', requireAdminAuth, (req, res) => {
  try {
    const { limit = 30, offset = 0, status = '' } = req.query || {};
    const data = listHeartbeatRuns({
      limit: Number(limit),
      offset: Number(offset),
      status: String(status || ''),
    });
    res.json(data);
  } catch (err2) { res.status(500).json({ error: err2.message || 'Heartbeat runs failed' }); }
});

app.post('/api/admin/heartbeat/run', requireAdminAuth, async (req, res) => {
  try {
    const {
      kind = 'manual',
      mode = '',
      batchSize = null,
      targetPerCategory = null,
      maxCategories = null,
    } = req.body || {};
    const run = await heartbeatWorker.triggerOnce(String(kind || 'manual'), {
      mode: String(mode || '').trim() || undefined,
      batchSize: batchSize === null ? undefined : Number(batchSize),
      targetPerCategory: targetPerCategory === null ? undefined : Number(targetPerCategory),
      maxCategories: maxCategories === null ? undefined : Number(maxCategories),
    });
    if (!run) return res.status(409).json({ error: 'Heartbeat run is already active' });
    const summary = summarizeHeartbeatRunJobs(run.id);
    res.json({ run, summary });
  } catch (err2) { res.status(500).json({ error: err2.message || 'Heartbeat manual run failed' }); }
});

// POST /api/admin/editor-batch/run — trigger editor batch run once
app.post('/api/admin/editor-batch/run', requireAdminAuth, async (req, res) => {
  try {
    const { batchSize = 12 } = req.body || {};
    const batch = await editorBatchWorker.triggerOnce({ batchSize: Number(batchSize) });
    res.json({ success: true, batchId: batch?.id || null });
  } catch (err2) { res.status(500).json({ error: err2.message || 'Editor batch run failed' }); }
});

// POST /api/admin/jobs/:id/requeue  — re-enqueue failed/cancelled job
app.post('/api/admin/jobs/:id/requeue', requireAdminAuth, (req, res) => {
  try {
    const job = requeueGenJob(req.params.id);
    if (!job) return res.status(404).json(err(req, 'gen.jobNotFound'));
    logAdminAction({
      adminUserId: req.currentUser.id,
      adminUsername: req.currentUser.username,
      action: 'requeue_job',
      details: { jobId: req.params.id, model: job.model },
    });
    res.json(job);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// POST /api/admin/jobs/:id/cancel  — cancel a queued/running job
app.post('/api/admin/jobs/:id/cancel', requireAdminAuth, (req, res) => {
  try {
    const job = cancelGenJob(req.params.id);
    if (!job) return res.status(404).json(err(req, 'gen.jobNotFound'));
    logAdminAction({
      adminUserId: req.currentUser.id,
      adminUsername: req.currentUser.username,
      action: 'cancel_job',
      details: { jobId: req.params.id },
    });
    res.json(job);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// GET /api/admin/logs  — list admin activity logs
app.get('/api/admin/logs', requireAdminAuth, (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = listAdminLogs({ limit: Number(limit), offset: Number(offset) });
    res.json(result);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// GET /api/admin/moderation/checks  — list moderation checks
app.get('/api/admin/moderation/checks', requireAdminAuth, (req, res) => {
  try {
    const { requestType = '', subjectType = '', decision = '', limit = 60, offset = 0 } = req.query;
    const result = listModerationChecks({
      requestType: String(requestType || ''),
      subjectType: String(subjectType || ''),
      decision: String(decision || ''),
      limit: Number(limit),
      offset: Number(offset),
    });
    res.json(result);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// POST /api/admin/moderation/checks/:id/approve
app.post('/api/admin/moderation/checks/:id/approve', requireAdminAuth, (req, res) => {
  try {
    const updated = approveModerationCheck(req.params.id);
    if (!updated) return res.status(404).json(err(req, 'common.notFound'));
    logAdminAction({
      adminUserId: req.currentUser.id,
      adminUsername: req.currentUser.username,
      action: 'approve_moderation_check',
      details: { checkId: req.params.id },
    });
    res.json(updated);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// POST /api/admin/moderation/checks/:id/reject
app.post('/api/admin/moderation/checks/:id/reject', requireAdminAuth, (req, res) => {
  try {
    const { reason = 'Rejected by admin' } = req.body || {};
    const updated = rejectModerationCheck(req.params.id, String(reason || 'Rejected by admin'));
    if (!updated) return res.status(404).json(err(req, 'common.notFound'));
    logAdminAction({
      adminUserId: req.currentUser.id,
      adminUsername: req.currentUser.username,
      action: 'reject_moderation_check',
      details: { checkId: req.params.id, reason: String(reason || 'Rejected by admin') },
    });
    res.json(updated);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// Legacy hard delete of moderation history item
app.post('/api/admin/moderation/:id/delete', requireAdminAuth, (req, res) => {
  try {
    const { id } = req.params;
    deleteHistory(id);
    logAdminAction({
      adminUserId: req.currentUser.id,
      adminUsername: req.currentUser.username,
      action: 'delete_history',
      details: { historyId: id },
    });
    res.json({ success: true });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// ── Analytics helpers ────────────────────────────────────────────────────────

// Bot user-agent patterns (case-insensitive match)
const BOT_UA_PATTERNS = [
  'bot', 'crawl', 'spider', 'scraper', 'slurp', 'archiver', 'nutch',
  'python-requests', 'python-urllib', 'httpx', 'axios', 'node-fetch',
  'go-http', 'java/', 'perl', 'ruby', 'curl', 'wget', 'fetch', 'okhttp',
  'aiohttp', 'asynchttp', 'mechanize', 'phantomjs', 'headless', 'selenium',
  'puppeteer', 'playwright', 'chrome-lighthouse', 'lighthouse',
  'googlebot', 'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot',
  'applebot', 'twitterbot', 'facebookexternalhit', 'linkedinbot', 'slackbot',
  'telegrambot', 'whatsapp', 'telegram', 'meta-externalagent',
  'semrush', 'ahrefs', 'screaming', 'httrack', 'sitebulb', 'screener',
  'uptimerobot', 'pingdom', 'newrelic', 'datadog', 'cloudflare-workers',
  'kafka', 'grpc', 'grpc-census', 'grpc-go', 'istio',
  'zap', 'nuclei', 'nikto', 'dirbuster', 'gobuster', 'sqlmap',
  'postman', 'insomnia', 'swagger', 'postman-runtime', 'jetbrains',
  'electron', 'tor', 'tor Browser',
  // Generic scraper indicators
  'scraper', 'scrape', 'scan', 'check', 'monitor', 'uptime', 'health',
];

function isBotUA(ua) {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_UA_PATTERNS.some(p => lower.includes(p));
}

// In-memory rate limiter: IP -> { count, resetAt }
const rateLimitMap = new Map();
const RATE_LIMIT = 120;      // max events per window per IP
const RATE_WINDOW = 3600000; // 1 hour in ms

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT) return false;
    entry.count++;
  } else {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
  }
  return true;
}

// ── Analytics routes ─────────────────────────────────────────────────────────

// POST /api/analytics/event  — track a page view or user action (public, no auth required)
app.post('/api/analytics/event', async (req, res) => {
  try {
    const { eventType, eventName, path, extraData } = req.body || {};
    if (!eventType || !eventName) {
      return res.status(400).json({ error: 'eventType and eventName are required' });
    }

    // ── Bot filtering ──────────────────────────────────────────────────────────
    const ua = req.headers['user-agent'] || '';
    if (isBotUA(ua)) {
      return res.json({ success: true, tracked: false, reason: 'bot' });
    }

    const geo = await resolveGeoLocationFromRequest(req);
    const ip = geo.ipAddress || '';
    const country = geo.country || '';
    const region = geo.region || '';
    const city = geo.city || '';

    // ── Rate limiting ───────────────────────────────────────────────────────────
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: 'rate limit exceeded' });
    }

    // ── Path sanitisation (block obvious scanner paths) ────────────────────────
    const safePath = path || '';
    const blockedPathPatterns = [
      /^\/admin/i, /^\/wp-/i, /^\/\.env/i, /^\/\.git/i,
      /^\/phpmyadmin/i, /^\/xmlrpc/i, /^\/wp-login/i,
      /^\/console/i, /^\/actuator/i, /^\/swagger/i,
      /^\/api\/[a-z]+\/admin/i, /^\/manager/i,
    ];
    if (blockedPathPatterns.some(re => re.test(safePath))) {
      return res.json({ success: true, tracked: false, reason: 'blocked_path' });
    }

    // Only trust authenticated session for user identity.
    const userId = getCurrentUserOptional(req)?.id || null;

    // Session id: prefer body (from frontend's getSessionId()), fallback to header
    const sessionId = req.body.sessionId || req.headers['x-session-id'] || '';
    // Device type: prefer body (from frontend's getDeviceType()), fallback to UA detection
    const deviceType = req.body.deviceType || (ua.includes('mobile') || ua.includes('android') ? 'mobile'
      : ua.includes('tablet') ? 'tablet' : 'desktop');
    // Referrer: prefer body extraData.referrer, fallback to header
    const referrer = (extraData && extraData.referrer) || req.headers.referer || req.headers.referrer || '';

    trackEvent({
      eventType,
      eventName,
      path: safePath,
      userId,
      sessionId,
      deviceType,
      referrer,
      extraData: extraData || {},
      ipAddress: ip,
      country,
      region,
      city,
    });

    res.json({ success: true });
  } catch (err2) {
    console.error('[analytics] track error:', err2);
    res.status(500).json({ error: 'internal error' });
  }
});

// GET /api/admin/analytics  — analytics stats for admin dashboard
app.get('/api/admin/analytics', requireAdminAuth, (req, res) => {
  try {
    const sinceHours = Number(req.query.sinceHours || 24);
    const period = req.query.period || 'week';
    const stats = getAnalyticsStats({ sinceHours, period });
    res.json(stats);
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// GET /api/admin/stats  — full site stats for admin dashboard
app.get('/api/admin/stats', requireAdminAuth, (req, res) => {
  try {
    const stats = getStats();
    const totalUsers = db.prepare('SELECT COUNT(1) AS c FROM users').get().c;
    const totalPrompts = db.prepare('SELECT COUNT(1) AS c FROM prompts').get().c;
    const totalImages = db.prepare('SELECT COUNT(1) AS c FROM gen_history').get().c;
    const pendingJobs = db.prepare("SELECT COUNT(1) AS c FROM gen_jobs WHERE status = 'queued'").get().c;
    const failedJobs = db.prepare("SELECT COUNT(1) AS c FROM gen_jobs WHERE status = 'failed'").get().c;
    const runningJobs = db.prepare("SELECT COUNT(1) AS c FROM gen_jobs WHERE status = 'running'").get().c;
    res.json({
      ...stats,
      totalUsers,
      totalPrompts,
      totalImages,
      pendingJobs,
      failedJobs,
      runningJobs,
    });
  } catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

// POST /api/admin/tags/backfill — batch LLM tagging with DeepSeek
app.post('/api/admin/tags/backfill', requireAdminAuth, async (req, res) => {
  try {
    const {
      limit = 100,
      offset = 0,
      includeTagged = false,
      category = '',
      batchSize = 10,
      concurrency = 10,
      dryRun = false,
      model,
    } = req.body || {};

    const items = listPromptRowsForTagging({
      limit: Number(limit),
      offset: Number(offset),
      includeTagged: Boolean(includeTagged),
      category: String(category || ''),
    });

    if (items.length === 0) {
      return res.json({
        totalCandidate: countPromptRowsForTagging({
          includeTagged: Boolean(includeTagged),
          category: String(category || ''),
        }),
        selected: 0,
        updated: 0,
        dryRun: Boolean(dryRun),
        results: [],
      });
    }

    const tagged = await tagPromptsInParallel(items, {
      batchSize: Number(batchSize),
      concurrency: Number(concurrency),
      model: model || process.env.DEEPSEEK_TAG_MODEL || 'deepseek-chat',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
    });

    let updated = 0;
    if (!dryRun) {
      for (const row of tagged) {
        const saved = applyPromptTagging({
          promptId: row.id,
          category: row.category,
          tags: row.tags,
          source: 'llm',
          confidence: row.confidence,
        });
        if (saved) updated += 1;
      }
    }

    return res.json({
      totalCandidate: countPromptRowsForTagging({
        includeTagged: Boolean(includeTagged),
        category: String(category || ''),
      }),
      selected: items.length,
      updated,
      dryRun: Boolean(dryRun),
      results: tagged,
    });
  } catch (err2) {
    console.error('[admin/tags/backfill] error:', err2);
    return res.status(500).json({ error: err2.message || 'Tag backfill failed' });
  }
});

// ─── Sitemap + Robots ────────────────────────────────────────────────────────
const SITEMAP_LIMIT = 1000;

app.get('/sitemap.xml', (req, res) => {
  const proto = (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'].includes('https') ? 'https' : 'http');
  const configuredBase = String(process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  const host  = req.headers.host || 'localhost:3001';
  const base  = configuredBase || (proto + '://' + host);
  const today = new Date().toISOString().split('T')[0];

  const rows = db.prepare(`
    SELECT p.id, p.created_at, p.category, p.image_url, u.username
    FROM prompts p
    LEFT JOIN users u ON u.id = p.author_user_id
    WHERE p.image_url IS NOT NULL AND p.image_url != ''
    ORDER BY p.created_at DESC
    LIMIT ?
  `).all(SITEMAP_LIMIT);

  const promptUrls = rows.map(r => `
  <url>
    <loc>${base}/prompt/${r.id}</loc>
    <lastmod>${r.created_at ? String(r.created_at).split('T')[0] : today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${['Portrait','Fashion','Editorial'].includes(r.category) ? '0.8' : '0.6'}</priority>
    <image:image>
      <image:loc>${r.image_url.startsWith('/') ? base + r.image_url : r.image_url}</image:loc>
      <image:title>${(r.username || 'Lovioa user')} AI photography prompt</image:title>
    </image:image>
  </url>`).join('');

  const profileUsers = db.prepare(`
    SELECT DISTINCT u.id, u.username, MAX(p.created_at) as last_prompt
    FROM users u
    JOIN prompts p ON p.author_user_id = u.id
    GROUP BY u.id
    LIMIT 500
  `).all();

  const profileUrls = profileUsers.map(u => `
  <url>
    <loc>${base}/profile/${u.id}</loc>
    <lastmod>${u.last_prompt ? String(u.last_prompt).split('T')[0] : today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`).join('');

  res.type('application/xml').send(
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>${base}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${base}/saved</loc>
    <changefreq>weekly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>${base}/history</loc>
    <changefreq>weekly</changefreq>
    <priority>0.3</priority>
  </url>${promptUrls}${profileUrls}
</urlset>`
  );
});

app.get('/robots.txt', (req, res) => {
  const proto = (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'].includes('https') ? 'https' : 'http');
  const configuredBase = String(process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  const host  = req.headers.host || 'localhost:3001';
  const base  = configuredBase || (proto + '://' + host);
  res.type('text/plain').send(
`User-agent: *
Allow: /

# API and media routes have no SEO value
Disallow: /api/
Disallow: /uploads/

# App-only routes
Disallow: /auth
Disallow: /subscribe
Disallow: /balance
Disallow: /admin
Disallow: /upload

Sitemap: ${base}/sitemap.xml`
  );
});
// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  if (err.message === 'Only image files are allowed') {
    return res.status(400).json(err(req, 'upload.typeInvalid'));
  }
  console.error(err);
  res.status(500).json(err(req, 'common.internalError'));
});

// ─── Billing ───────────────────────────────────────────────────────────────────
let stripe = null;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const PLANS = [
  {
    id: 'starter_cny',
    tierId: 'starter',
    name: 'Starter',
    displayName: '入门套餐',
    price: 1000,
    currency: 'cny',
    credits: 66,
    fastCredits: 66,
    imagePrice: 0.15,
    popular: false,
    features: [
      'One-time purchase, never expires',
      'About 66 AI image generations',
      'About CNY 0.15 per image',
    ],
  },
  {
    id: 'standard_cny',
    tierId: 'standard',
    name: 'Standard',
    displayName: '标准套餐',
    price: 2000,
    currency: 'cny',
    credits: 166,
    fastCredits: 166,
    imagePrice: 0.12,
    popular: true,
    features: [
      'One-time purchase, never expires',
      'About 166 AI image generations',
      'About CNY 0.12 per image',
    ],
  },
  {
    id: 'premium_cny',
    tierId: 'premium',
    name: 'Premium',
    displayName: '高级套餐',
    price: 9900,
    currency: 'cny',
    credits: 990,
    fastCredits: 990,
    imagePrice: 0.1,
    popular: false,
    features: [
      'One-time purchase, never expires',
      'About 990 AI image generations',
      'About CNY 0.10 per image',
    ],
  },
];

if (STRIPE_SECRET_KEY) {
  try {
    const Stripe = (await import('stripe')).default;
    stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-04-30.basil' });
    console.log('[billing] Stripe SDK loaded');
  } catch (e) {
    console.warn('[billing] Stripe SDK not available, billing disabled');
  }
} else {
  console.warn('[billing] STRIPE_SECRET_KEY not set — billing routes disabled');
}

app.get('/api/billing', requireAuth, (req, res) => {
  try { res.json(getUserBilling(req.currentUser.id)); }
  catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.post('/api/billing/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json(err(req, 'billing.unavailable'));
  try {
    const { planId = 'starter_cny' } = req.body || {};
    const plan = PLANS.find(p => p.id === planId);
    if (!plan) return res.status(400).json(err(req, 'billing.invalidPlan'));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: plan.currency,
          product_data: {
            name: `Promptfolio ${plan.displayName}`,
            description: `${plan.fastCredits} AI image generations, about CNY ${plan.imagePrice} per image`,
          },
          unit_amount: plan.price,
        },
        quantity: 1,
      }],
      success_url: `${BASE_URL}/subscribe?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/subscribe`,
      customer_email: req.currentUser.email,
      metadata: {
        userId: req.currentUser.id,
        planId: plan.id,
        credits: String(plan.credits),
        type: 'package',
      },
    });
    res.json({ url: session.url });
  } catch (err2) {
    console.error('[billing] checkout error:', err2);
    res.status(500).json(err(req, 'billing.checkoutFailed'));
  }
});

app.post('/api/billing/portal', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json(err(req, 'billing.unavailable'));
  try {
    const sub = getSubscriptionByUserId(req.currentUser.id);
    if (!sub?.stripeCustomerId) return res.status(400).json(err(req, 'billing.noSubscription'));

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${BASE_URL}/balance`,
    });
    res.json({ url: session.url });
  } catch (err2) {
    console.error('[billing] portal error:', err2);
    res.status(500).json(err(req, 'billing.portalFailed'));
  }
});

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe disabled');
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err2) {
    console.error('[billing] webhook signature error:', err2.message);
    return res.status(400).send(`Webhook Error: ${err2.message}`);
  }
  if (isWebhookEventProcessed(event.id)) {
    return res.json({ received: true, skipped: 'already_processed' });
  }
  try {
    const { userId, planId, credits, type } = event.data.object?.metadata || {};
    const plan = PLANS.find(p => p.id === planId);
    if (!plan && planId) {
      console.error(`[billing] webhook unknown planId="${planId}", skipping credit grant`);
      markWebhookEventProcessed(uuidv4(), event.id, event.type);
      return res.json({ received: true, skipped: 'unknown_plan' });
    }
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription' && session.subscription && userId) {
          // Always createSubscription — cancels any existing active subscription.
          // Credits accumulate on top regardless of prior subscriptions (累加模式).
          const periodStart = new Date(session.created * 1000).toISOString();
          const periodEnd = new Date((session.created + 2592000) * 1000).toISOString();
          createSubscription({
            id: uuidv4(), userId, plan: planId,
            stripeSubscriptionId: String(session.subscription),
            stripeCustomerId: String(session.customer || ''),
            currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
          });
          addCredits(userId, Number(credits || plan?.credits || 0), 'paid');
        } else if (session.mode === 'payment' && userId && type === 'package') {
          addCredits(userId, Number(credits || plan?.credits || 0), 'paid');
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        // invoice.payment_succeeded is a recurring charge — do NOT grant credits again
        // (credits are only granted once at initial checkout). Update subscription status only.
        const subId = String(event.data.object.subscription || '');
        if (subId) {
          const sub = event.data.object;
          if (sub.period_start && sub.period_end) {
            updateSubscriptionStatus(subId, 'active', new Date(sub.period_end * 1000).toISOString());
          }
        }
        break;
      }
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        if (paymentIntent.metadata?.type === 'topup' && paymentIntent.metadata?.userId) {
          const topupCredits = Number(paymentIntent.metadata.creditsAmount || 0);
          if (topupCredits > 0) addCredits(paymentIntent.metadata.userId, topupCredits, 'paid');
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subId = String(event.data.object.id || '');
        if (subId) updateSubscriptionStatus(subId, 'cancelled', null);
        break;
      }
      case 'customer.subscription.updated': {
        const subId = String(event.data.object.id || '');
        const status = event.data.object.status === 'active' ? 'active' : event.data.object.status;
        const periodEnd = event.data.object.current_period_end
          ? new Date(event.data.object.current_period_end * 1000).toISOString() : null;
        if (subId) updateSubscriptionStatus(subId, status, periodEnd);
        break;
      }
    }
    markWebhookEventProcessed(uuidv4(), event.id, event.type);
    res.json({ received: true });
  } catch (err2) {
    console.error('[billing] webhook handler error:', err2);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

app.get('/api/billing/plans', (_req, res) => res.json(Object.values(PLANS)));

app.get('/api/billing/balance', requireAuth, (req, res) => {
  try { res.json(getUserBilling(req.currentUser.id)); }
  catch (err2) { res.status(500).json(err(req, 'common.internalError')); }
});

app.post('/api/billing/topup', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json(err(req, 'billing.unavailable'));
  const { amount = 0 } = req.body || {};
  const topupPlan = PLANS.find(plan => plan.price === Number(amount));
  if (!topupPlan) return res.status(400).json(err(req, 'billing.invalidAmount'));
  try {
    const sub = getSubscriptionByUserId(req.currentUser.id);
    const customerId = sub?.stripeCustomerId || undefined;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: topupPlan.currency,
          product_data: {
            name: `Promptfolio ${topupPlan.displayName}`,
            description: `${topupPlan.credits} AI image generations`,
          },
          unit_amount: topupPlan.price,
        },
        quantity: 1,
      }],
      success_url: `${BASE_URL}/balance?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/balance`,
      customer_email: req.currentUser.email,
      ...(customerId ? { customer: customerId } : {}),
      metadata: {
        userId: req.currentUser.id,
        type: 'package',
        credits: String(topupPlan.credits),
        creditsAmount: String(topupPlan.credits),
        planId: topupPlan.id,
      },
    });
    res.json({ url: session.url });
  } catch (err2) {
    console.error('[billing] topup error:', err2);
    res.status(500).json(err(req, 'billing.topupFailed'));
  }
});

app.post('/api/billing/cancel', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json(err(req, 'billing.unavailable'));
  try {
    const sub = getSubscriptionByUserId(req.currentUser.id);
    if (!sub?.stripeSubscriptionId) return res.status(400).json(err(req, 'billing.noSubscription'));
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    res.json({ ok: true });
  } catch (err2) {
    console.error('[billing] cancel error:', err2);
    res.status(500).json(err(req, 'billing.cancelFailed'));
  }
});

// ─── Start Workers ──────────────────────────────────────────────────────────

// Seed default admin account if none exist
(async () => {
  try {
    const admins = db.prepare('SELECT COUNT(*) AS c FROM admin_accounts WHERE is_active = 1').get();
    if (admins.c === 0) {
      const username = String(process.env.ADMIN_USERNAME || '').trim();
      const password = String(process.env.ADMIN_PASSWORD || '');
      if (!username || !password) {
        console.warn('[admin] no active admin account found. set ADMIN_USERNAME and ADMIN_PASSWORD to bootstrap admin.');
      } else {
        const id = uuidv4();
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const displayName = process.env.ADMIN_DISPLAY_NAME || 'Admin';
        const avatar = `https://api.dicebear.com/7.x/miniavs/svg?seed=${encodeURIComponent(username)}`;
        createAdminAccount({ id, username, passwordHash, displayName, avatar });
        console.log(`[admin] bootstrap admin account created: ${username}`);
      }
    }
    cleanExpiredUserSessions();
    cleanExpiredAdminSessions();
  } catch (e) {
    console.error('[admin] setup failed:', e);
  }
})();

let worker = null;
let remoteSyncWorker = null;
let heartbeatWorker = null;
let editorBatchWorker = null;

function startBackgroundWorkers() {
  worker = startGenQueueWorker({
    baseUrl: OPENAI_BASE_URL,
    apiKey: OPENAI_API_KEY,
    apiKeysByModel: IMAGE_MODEL_API_KEYS,
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

  remoteSyncWorker = startRemoteSyncWorker({
    enabled: REMOTE_SYNC_ENABLED,
    remoteBaseUrl: REMOTE_SYNC_BASE_URL,
    remoteUserId: REMOTE_SYNC_USER_ID,
    pollIntervalMs: REMOTE_SYNC_POLL_MS,
    batchSize: REMOTE_SYNC_BATCH_SIZE,
    logger: console,
  });

  heartbeatWorker = startHeartbeatWorker({
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

  editorBatchWorker = startEditorBatchWorker({
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

  const stopAll = async () => {
    if (worker) {
      worker.stop();
      await worker.wait();
    }
    if (remoteSyncWorker) {
      remoteSyncWorker.stop();
      await remoteSyncWorker.wait();
    }
    if (heartbeatWorker) {
      heartbeatWorker.stop();
      await heartbeatWorker.wait();
    }
    if (editorBatchWorker) {
      editorBatchWorker.stop();
      await editorBatchWorker.wait();
    }
  };

  process.on('SIGINT', async () => {
    await stopAll();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopAll();
    process.exit(0);
  });
}

if (START_WORKERS) {
  startBackgroundWorkers();
}

app.on('error', (err) => {
  console.error('[server] uncaught error event:', err);
});

app.listen(PORT, () => {
  console.log(`Lovioa API running at http://localhost:${PORT}`);
  console.log(`Uploads: ${UPLOADS_DIR}`);
  console.log(`[runtime] workers=${START_WORKERS}`);
  console.log(`[gen-queue] workers=${QUEUE_WORKERS} model=${DEFAULT_MODEL} size=${DEFAULT_SIZE} quality=${DEFAULT_QUALITY}`);
  console.log(`[gen-queue] fastChannels=${FAST_CHANNELS.length} fastEnabled=${FAST_CHANNELS.length > 0} fastBase=${GEN_FAST_API_BASE_URL_CN || GEN_FAST_API_BASE_URL} fastPath=${GEN_FAST_API_PATH} fastQualities=${GEN_FAST_QUALITIES} forceFast=${GEN_FORCE_FAST_FOR_ALL}`);
  console.log(`[remote-sync] enabled=${REMOTE_SYNC_ENABLED} target=${REMOTE_SYNC_BASE_URL || '(none)'} batch=${REMOTE_SYNC_BATCH_SIZE} pollMs=${REMOTE_SYNC_POLL_MS}`);
  console.log(`[heartbeat] enabled=${HEARTBEAT_ENABLED} intervalMs=${HEARTBEAT_INTERVAL_MS} batchSize=${HEARTBEAT_BATCH_SIZE} deepseekModel=${HEARTBEAT_DEEPSEEK_MODEL} categoryTarget=${HEARTBEAT_CATEGORY_TARGET} maxBackfillCategories=${HEARTBEAT_MAX_BACKFILL_CATEGORIES}`);
  console.log(`[editor-batch] enabled=${EDITOR_BATCH_ENABLED} intervalMs=${EDITOR_BATCH_INTERVAL_MS} batchSize=${EDITOR_BATCH_SIZE} deepseekModel=${EDITOR_BATCH_DEEPSEEK_MODEL}`);
});
