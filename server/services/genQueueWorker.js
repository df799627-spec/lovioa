import {
  claimNextGenJob,
  markGenJobSucceeded,
  markGenJobFailed,
  addHistory,
  reclaimStaleGenJobs,
  advanceEditorItemFromStep1,
  advanceEditorItemFromStep2,
  markEditorItemStep1Failed,
  markEditorItemStep2Failed,
} from '../db/promptsRepo.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const DEFAULT_NANO_IMAGE_MODEL_MAP = Object.freeze({
  'gemini-3-pro-image': 'gpt-image-gemini-3-pro-image',
  'gemini-3.1-flash-image': 'gpt-image-gemini-3.1-flash-image',
  'image-gemini-3-pro-image': 'gpt-image-gemini-3-pro-image',
});

// Cloud storage: lazily import and detect config at runtime (supports S4 and R2)
let _cloudStorage = null;

async function getCloudStorage() {
  if (_cloudStorage !== null) return _cloudStorage;
  const mod = await import('../services/cloudStorage.js');
  _cloudStorage = mod?.isStorageConfigured?.() ? mod : null;
  return _cloudStorage;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function localUrlToBase64(url, signal) {
  if (!url) return null;

  // Already a data URI — return as-is (base64 already encoded)
  if (url.startsWith('data:')) {
    return url;
  }

  // Local file read: use an independent AbortController so a stuck disk read
  // does not consume the job-level 180s budget that is shared with the API call.
  if (url.startsWith('/uploads/')) {
    const filePath = path.join(UPLOADS_DIR, url.slice('/uploads/'.length));
    const localCtrl = new AbortController();
    const localTimeoutId = setTimeout(() => localCtrl.abort(), 30_000);
    try {
      if (!existsSync(filePath)) {
        clearTimeout(localTimeoutId);
        return null;
      }
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
      const mime = mimeMap[ext] || 'image/jpeg';
      const raw = readFileSync(filePath);
      clearTimeout(localTimeoutId);
      return `data:${mime};base64,${raw.toString('base64')}`;
    } catch (err) {
      clearTimeout(localTimeoutId);
      return null;
    }
  }

  // Remote URL — fetch and convert
  // Use an independent AbortController so slow downloads don't eat into the
  // 180-second job budget. The job-level signal stays reserved for the API call.
  if (/^https?:\/\//i.test(url)) {
    const imgCtrl = new AbortController();
    const imgTimeoutId = setTimeout(() => imgCtrl.abort(), 90_000);
    try {
      const res = await fetch(url, { signal: imgCtrl.signal });
      clearTimeout(imgTimeoutId);
      if (!res.ok) return null;
      const mimeType = res.headers.get('Content-Type') || 'image/png';
      const buf = await res.arrayBuffer();
      return `data:${mimeType};base64,${Buffer.from(buf).toString('base64')}`;
    } catch {
      clearTimeout(imgTimeoutId);
      return null;
    }
  }

  return null;
}

function buildEnhancedPrompt(job) {
  return job.negativePrompt
    ? `${job.prompt}\nAvoid: ${job.negativePrompt}`
    : job.prompt;
}

function openAiApiUrl(baseUrl, pathname) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const versionedBase = /\/v1$/i.test(base) ? base : `${base}/v1`;
  const pathPart = String(pathname || '').startsWith('/') ? pathname : `/${pathname}`;
  return `${versionedBase}${pathPart}`;
}

function openAiCompatibleBaseUrl(baseUrl) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function normalizeNanoImageModelMap(modelMap) {
  const source = modelMap && typeof modelMap === 'object' ? modelMap : {};
  return {
    ...DEFAULT_NANO_IMAGE_MODEL_MAP,
    ...Object.fromEntries(
      Object.entries(source)
        .map(([model, providerModel]) => [String(model).trim(), String(providerModel || '').trim()])
        .filter(([model, providerModel]) => model && providerModel),
    ),
  };
}

function nanoImageSize(job) {
  const ratio = String(job?.generationOptions?.aspectRatio || '').trim();
  const sizeByRatio = {
    '1:1': '1024x1024',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '4:3': '1536x1024',
    '3:4': '1024x1536',
  };
  return sizeByRatio[ratio] || job?.size || '1024x1024';
}

async function callNanoImageGeneration({ proxyUrl, upstreamBaseUrl, apiKey, providerModel, job, signal }) {
  if (job.mode === 'edit' && job.referenceImageUrl) {
    throw new Error('Nano Banana does not support image editing through the configured provider');
  }

  const response = await fetch(String(proxyUrl || '').trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseUrl: openAiCompatibleBaseUrl(upstreamBaseUrl),
      apiKey,
      model: providerModel,
      prompt: buildEnhancedPrompt(job),
      size: nanoImageSize(job),
    }),
    signal,
  });
  const text = await response.text();
  const data = safeJson(text) || {};
  if (!response.ok) {
    throw Object.assign(
      new Error(`Nano provider HTTP ${response.status}: ${text.slice(0, 500)}`),
      { status: response.status, body: text },
    );
  }

  const first = data?.images?.[0] || data?.data?.[0] || {};
  return first.url
    || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '')
    || '';
}

function normalizeCsvSet(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

function normalizePositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const v = Math.floor(n);
  return v > 0 ? v : 0;
}

function parseFastChannels(raw, legacyDefaults = {}) {
  let parsed = [];
  if (String(raw || '').trim()) {
    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data)) parsed = data;
    } catch {
      // ignore malformed channel JSON and fallback to legacy config
    }
  }

  const fallback = [{
    name: 'legacy-fast',
    baseUrl: legacyDefaults.fastBaseUrl || '',
    baseUrlCn: legacyDefaults.fastBaseUrlCn || '',
    apiPath: legacyDefaults.fastApiPath || '/v1/api/generate',
    resultPath: legacyDefaults.fastResultPath || '/v1/api/result',
    apiKey: legacyDefaults.fastApiKey || '',
    replyType: legacyDefaults.fastReplyType || 'json',
    models: legacyDefaults.fastModels || '',
    qualities: legacyDefaults.fastQualities || '',
    forceFastForAll: !!legacyDefaults.forceFastForAll,
    enabled: true,
  }];

  const source = parsed.length > 0 ? parsed : fallback;
  return source.map((ch, idx) => {
    const bases = [
      ...(Array.isArray(ch?.baseUrls) ? ch.baseUrls : []),
      ch?.baseUrlCn,
      ch?.baseUrl,
      ch?.backupBaseUrl,
      ch?.fallbackBaseUrl,
    ]
      .map((v) => String(v || '').trim().replace(/\/+$/, ''))
      .filter(Boolean);

    const apiKey = String(ch?.apiKey ?? legacyDefaults.fastApiKey ?? '').trim();
    const enabled = ch?.enabled === undefined ? true : Boolean(ch.enabled);
    return {
      name: String(ch?.name || `fast-${idx + 1}`),
      enabled,
      apiKey,
      bases: [...new Set(bases)],
      apiPath: String(ch?.apiPath || legacyDefaults.fastApiPath || '/v1/api/generate').trim(),
      editApiPath: String(ch?.editApiPath || legacyDefaults.fastEditApiPath || '/v1/images/edits').trim(),
      resultPath: String(ch?.resultPath || legacyDefaults.fastResultPath || '/v1/api/result').trim(),
      replyType: String(ch?.replyType || legacyDefaults.fastReplyType || 'json').trim(),
      models: normalizeCsvSet(ch?.models ?? legacyDefaults.fastModels),
      qualities: normalizeCsvSet(ch?.qualities ?? legacyDefaults.fastQualities),
      forceFastForAll: ch?.forceFastForAll === undefined
        ? Boolean(legacyDefaults.forceFastForAll)
        : Boolean(ch.forceFastForAll),
      maxConcurrency: normalizePositiveInt(
        ch?.maxConcurrency
        ?? ch?.concurrency
        ?? ch?.maxConcurrent
        ?? legacyDefaults.fastMaxConcurrency
        ?? 0,
      ),
    };
  }).filter((c) => c.enabled && c.apiKey && c.bases.length > 0);
}

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

function pickFastTaskId(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const id = payload.id || payload.task_id || payload.taskId || payload.result?.id;
  return typeof id === 'string' ? id : '';
}

function normalizeStatus(status) {
  return String(status || '').trim().toLowerCase();
}

async function callSlowImageGeneration(baseUrl, apiKey, job, signal) {
  // Edit mode uses multipart/form-data for providers that support it.
  if (job.mode === 'edit' && job.referenceImageUrl) {
    const b64 = await localUrlToBase64(job.referenceImageUrl, signal);
    if (!b64) throw new Error(`Could not load reference image from: ${job.referenceImageUrl}`);

    // Parse data URI to binary
    let mimeType = 'image/png';
    let binaryData = null;
    const dataUriMatch = b64.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUriMatch) {
      mimeType = dataUriMatch[1];
      binaryData = Buffer.from(dataUriMatch[2], 'base64');
    } else {
      throw new Error('Unexpected URL-to-base64 format');
    }

    const endpoints = ['/v1/images/edits', '/v1/images/generations'];
    let lastErr = null;

    for (const endpoint of endpoints) {
      const form = new FormData();
      form.append('image', new Blob([binaryData], { type: mimeType }), 'ref.png');
      form.append('prompt', buildEnhancedPrompt(job));
      form.append('model', job.model || 'gpt-image-2');
      form.append('aspect_ratio', job.size || '1024x1024');
      form.append('response_format', 'url');

      try {
        const res = await fetch(openAiApiUrl(baseUrl, endpoint), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'x-api-key': apiKey,
          },
          body: form,
          signal,
        });
        if (!res.ok) {
          const text = await res.text();
          lastErr = Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`), { status: res.status, body: text });
          continue; // try next endpoint
        }
        const data = safeJson(await res.text());
        const first = data?.data?.[0] || {};
        return first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '') || '';
      } catch (err) {
        lastErr = err;
        continue; // try next endpoint
      }
    }
    throw lastErr || new Error('All slow edit-mode endpoints failed');
  }

  // Text mode
  // yfy/OneAPI only supports 1024x1024, 1792x1024, 1024x1792 — default to 1024x1024.
  const generationOptions = job.generationOptions || {};
  const payload = {
    model: job.model,
    prompt: buildEnhancedPrompt(job),
    n: 1,
  };
  if (generationOptions.provider === 'gemini') {
    payload.response_format = {
      type: 'image',
      aspect_ratio: generationOptions.aspectRatio || '1:1',
      image_size: generationOptions.imageSize || '1K',
    };
  } else {
    payload.size = job.size || '1024x1024';
    payload.quality = job.quality;
  }
  const res = await fetch(openAiApiUrl(baseUrl, '/images/generations'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) { const text = await res.text(); throw Object.assign(new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`), { status: res.status, body: text }); }
  const data = safeJson(await res.text());
  const first = data?.data?.[0] || {};
  return first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : '') || '';
}

async function pollFastResult({ baseUrls, resultPath, apiKey, taskId, signal, maxAttempts = 60, intervalMs = 1500 }) {
  const bases = (Array.isArray(baseUrls) ? baseUrls : [])
    .map((v) => String(v || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (bases.length === 0) throw new Error('Fast provider base URL not configured');
  const pathPart = resultPath.startsWith('/') ? resultPath : `/${resultPath}`;
  let lastError = null;
  for (let i = 0; i < maxAttempts; i++) {
    lastError = null;
    for (const base of bases) {
      try {
        const url = `${base}${pathPart}?id=${encodeURIComponent(taskId)}`;
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal,
        });

        const text = await res.text();
        const body = safeJson(text) || {};

        if (!res.ok) {
          throw Object.assign(new Error(`Fast provider result HTTP ${res.status}: ${text.slice(0, 500)}`), { status: res.status, body: text });
        }

        const imageUrl = pickFastImageUrl(body);
        if (imageUrl) return imageUrl;

        const status = normalizeStatus(body.status);
        if (status && ['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
          throw new Error(`Fast provider job failed: ${status}`);
        }
      } catch (err) {
        lastError = err;
      }
    }
    if (i === maxAttempts - 1 && lastError) throw lastError;
    await sleep(intervalMs);
  }

  throw new Error(`Fast provider result polling timed out for task ${taskId}`);
}

async function callFastImageGeneration(fastProvider, job, signal, logger) {
  const bases = Array.isArray(fastProvider.bases) ? fastProvider.bases.map((b) => b.replace(/\/$/, '')) : [];
  if (bases.length === 0) throw new Error('Fast provider base URL not configured');

  const isEditMode = job.mode === 'edit' && job.referenceImageUrl;
  // Only call providers that actually support edit mode.
  // Skip providers without an edit endpoint.
  if (isEditMode && !fastProvider.editApiPath) {
    throw Object.assign(new Error('Provider does not support edit mode'), { provider: fastProvider.name });
  }
  const baseApiPath = fastProvider.apiPath.startsWith('/') ? fastProvider.apiPath : `/${fastProvider.apiPath}`;
  const apiPath = isEditMode ? '/v1/images/edits' : baseApiPath;
  const pathPart = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;

  // ── Edit mode: multipart/form-data ───────────────────────────────────────────
  if (isEditMode) {
    const b64 = await localUrlToBase64(job.referenceImageUrl, signal);
    if (!b64) throw new Error(`Could not load reference image from: ${job.referenceImageUrl}`);

    // Parse data URI
    let mimeType = 'image/png';
    let binaryData = null;
    const dataUriMatch = b64.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUriMatch) {
      mimeType = dataUriMatch[1];
      binaryData = Buffer.from(dataUriMatch[2], 'base64');
    } else {
      // Should not happen since localUrlToBase64 always returns data URI
      throw new Error('Unexpected URL-to-base64 format');
    }

    const baseUrl = bases[0];
    const url = `${baseUrl}${apiPath}`;
    const form = new FormData();
    form.append('image', new Blob([binaryData], { type: mimeType }), 'ref.png');
    form.append('prompt', buildEnhancedPrompt(job));
    form.append('model', job.model || 'gpt-image-2');
    form.append('aspect_ratio', job.size || '1024x1024');
    form.append('response_format', 'url');

    // Independent timeout for this request — does NOT consume the job-level
    // 180s budget, so slow image downloads don't steal API call time.
    const reqCtrl = new AbortController();
    const reqTimeoutId = setTimeout(() => reqCtrl.abort(), 120_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fastProvider.apiKey}`,
          'x-api-key': fastProvider.apiKey,
        },
        body: form,
        signal: reqCtrl.signal,
      });
      clearTimeout(reqTimeoutId);

      const text = await res.text();
      if (!res.ok) {
        // 4xx auth/path errors: propagate so callImageGeneration tries next provider.
        // Providers without edit support are filtered out above.
        throw Object.assign(
          new Error(`Fast provider HTTP ${res.status}: ${text.slice(0, 500)}`),
          { status: res.status, body: text }
        );
      }

      const data = safeJson(text) || {};
      const directUrl = pickFastImageUrl(data);
      if (directUrl) return directUrl;

      const taskId = pickFastTaskId(data);
      const status = normalizeStatus(data.status);
      if (taskId) {
        return pollFastResult({ baseUrls: bases, resultPath: fastProvider.resultPath, apiKey: fastProvider.apiKey, taskId, signal });
      }

      throw new Error('Fast provider edit response had no image URL or task ID: ' + text.slice(0, 200));
    } catch (err) {
      clearTimeout(reqTimeoutId);
      if (err.status === 401 || err.status === 403) {
        // Auth error: re-throw so callImageGeneration tries next provider.
        throw err;
      }
      throw err; // propagate — callImageGeneration handles retry/next-provider logic
    }
  }

  // ── Text mode: use JSON ─────────────────────────────────────────────────────
  const payload = {
    model: job.model || 'gpt-image-2',
    prompt: buildEnhancedPrompt(job),
    aspectRatio: job.size || '1024x1024',
    replyType: fastProvider.replyType || 'json',
  };

  let lastError = null;
  for (const base of bases) {
    try {
      const res = await fetch(`${base}${pathPart}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fastProvider.apiKey}`,
          'x-api-key': fastProvider.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal,
      });

      const text = await res.text();
      const data = safeJson(text) || {};

      if (!res.ok) {
        throw Object.assign(new Error(`Fast provider HTTP ${res.status}: ${text.slice(0, 500)}`), { status: res.status, body: text });
      }

      const directUrl = pickFastImageUrl(data);
      if (directUrl) return directUrl;

      const status = normalizeStatus(data.status);
      const taskId = pickFastTaskId(data);
      if (taskId && status && !['succeeded', 'completed', 'success'].includes(status)) {
        return pollFastResult({
          baseUrls: [base], resultPath: fastProvider.resultPath, apiKey: fastProvider.apiKey, taskId, signal,
        });
      }

      if (taskId && !status) {
        return pollFastResult({
          baseUrls: [base], resultPath: fastProvider.resultPath, apiKey: fastProvider.apiKey, taskId, signal,
        });
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('No image returned by fast provider');
}

function shouldUseFastProvider(job, fastProvider, routing) {
  if (!fastProvider) return false;
  if (fastProvider.forceFastForAll || routing.forceFastForAll) return true;

  if (job.model && routing.fastModels.has(String(job.model).toLowerCase())) {
    return true;
  }
  if (job.model && fastProvider.models.has(String(job.model).toLowerCase())) {
    return true;
  }

  if (job.quality && routing.fastQualities.has(String(job.quality).toLowerCase())) {
    return true;
  }
  if (job.quality && fastProvider.qualities.has(String(job.quality).toLowerCase())) {
    return true;
  }

  return false;
}

let FAST_PROVIDER_CURSOR = 0;
function pickFastProviders(job, fastProviders, routing) {
  const all = (Array.isArray(fastProviders) ? fastProviders : []);
  const pinned = String(job?.preferredChannel || '').trim();
  const [pinnedProviderName, pinnedBaseRaw] = pinned.split('@');
  const pinnedBase = String(pinnedBaseRaw || '').trim().replace(/\/+$/, '');
  const eligible = all
    .filter((p) => shouldUseFastProvider(job, p, routing));
  // For edit-mode jobs, exclude providers that don't have an edit endpoint.
  // Edit jobs require a provider with an edit endpoint.
  const isEditJob = job?.mode === 'edit' && !!job?.referenceImageUrl;
  const editEligible = isEditJob
    ? eligible.filter((p) => !!p.editApiPath)
    : eligible;
  if (editEligible.length === 0) return eligible; // fall back to all eligible if none support edit
  if (pinned) {
    let exact = editEligible.filter((p) => p.name === pinned);
    if (exact.length === 0 && pinnedProviderName) {
      exact = editEligible.filter((p) => p.name === pinnedProviderName);
    }
    if (exact.length > 0) {
      if (pinnedBase) {
        return exact.map((p) => {
          const hasPinned = (p.bases || []).some((b) => String(b || '').replace(/\/+$/, '') === pinnedBase);
          if (!hasPinned) return p;
          return { ...p, bases: [pinnedBase] };
        });
      }
      return exact;
    }
  }
  if (editEligible.length <= 1) return editEligible;
  const start = FAST_PROVIDER_CURSOR % editEligible.length;
  FAST_PROVIDER_CURSOR += 1;
  return editEligible.slice(start).concat(editEligible.slice(0, start));
}

function buildFastProviderRuntime(fastProviders, globalConcurrency, logger) {
  const runtime = new Map();
  for (const provider of (Array.isArray(fastProviders) ? fastProviders : [])) {
    const configuredCap = normalizePositiveInt(provider.maxConcurrency);
    const cap = configuredCap > 0
      ? Math.min(configuredCap, globalConcurrency)
      : globalConcurrency;
    runtime.set(provider.name, {
      running: 0,
      maxConcurrency: Math.max(1, cap),
    });
  }
  if (runtime.size > 0) {
    const summary = Array.from(runtime.entries())
      .map(([name, state]) => `${name}:${state.maxConcurrency}`)
      .join(', ');
    logger.info(`[gen-queue] fast provider capacity ${summary}`);
  }
  return runtime;
}

function sortProvidersByLoad(providers, runtime) {
  return [...providers].sort((a, b) => {
    const ra = runtime.get(a.name) || { running: 0, maxConcurrency: 1 };
    const rb = runtime.get(b.name) || { running: 0, maxConcurrency: 1 };
    const la = ra.running / Math.max(1, ra.maxConcurrency);
    const lb = rb.running / Math.max(1, rb.maxConcurrency);
    if (la !== lb) return la - lb;
    return ra.running - rb.running;
  });
}

function tryAcquireFastProviderSlot(runtime, providerName) {
  const state = runtime.get(providerName);
  if (!state) return false;
  if (state.running >= state.maxConcurrency) return false;
  state.running += 1;
  return true;
}

function releaseFastProviderSlot(runtime, providerName) {
  const state = runtime.get(providerName);
  if (!state) return;
  state.running = Math.max(0, state.running - 1);
}

async function callImageGeneration({
  slowProvider,
  nanoProvider,
  fastProviders,
  fastProviderRuntime,
  routing,
  job,
  signal,
  logger,
}) {
  const nanoProviderModel = nanoProvider.modelMap[String(job.model || '').trim()];
  if (nanoProviderModel) {
    if (!nanoProvider.enabled) {
      throw new Error('Nano image provider is not configured');
    }
    const modelApiKey = nanoProvider.apiKeysByModel[String(job.model || '').trim()];
    if (!modelApiKey) {
      throw new Error(`No Nano API key configured for model ${job.model || 'unknown'}`);
    }
    const imageUrl = await callNanoImageGeneration({
      proxyUrl: nanoProvider.proxyUrl,
      upstreamBaseUrl: nanoProvider.upstreamBaseUrl,
      apiKey: modelApiKey,
      providerModel: nanoProviderModel,
      job,
      signal,
    });
    if (!imageUrl) throw new Error('Nano provider returned no image');
    return {
      imageUrl,
      provider: 'nano',
      providerName: 'code2alita-nano',
      sourceChannel: 'code2alita-nano',
    };
  }

  const providers = pickFastProviders(job, fastProviders, routing);

  if (providers.length > 0) {
    let lastFastErr = null;
    for (;;) {
      if (signal?.aborted) {
        throw new Error('Fast provider aborted while waiting for provider slot');
      }

      const candidates = sortProvidersByLoad(providers, fastProviderRuntime);
      let attempted = false;

      for (const provider of candidates) {
        if (!tryAcquireFastProviderSlot(fastProviderRuntime, provider.name)) continue;
        attempted = true;
        try {
          const imageUrl = await callFastImageGeneration(provider, job, signal, logger);
          return {
            imageUrl,
            provider: `fast:${provider.name}`,
            providerName: provider.name,
            sourceChannel: provider.name,
          };
        } catch (fastErr) {
          lastFastErr = fastErr;
          logger.warn(`[gen-queue] job=${job.id} fast provider ${provider.name} failed: ${fastErr.message}`);
        } finally {
          releaseFastProviderSlot(fastProviderRuntime, provider.name);
        }
      }

      if (!attempted) {
        await sleep(250);
        continue;
      }

      if (!slowProvider.enabled) {
        const isEdit = job.mode === 'edit' && !!job.referenceImageUrl;
        const noEditProvider = isEdit && providers.length === 0;
        if (noEditProvider) {
          throw new Error(
            'No fast provider supports edit mode (no editApiPath). ' +
            'Set a slow provider (OPENAI_API_KEY) or add a fast provider with editApiPath.'
          );
        }
        throw lastFastErr || new Error('All fast providers failed; no slow provider configured.');
      }
      logger.info(`[gen-queue] job=${job.id} all fast providers failed — falling back to slow provider (${slowProvider.baseUrl})`);
      break;
    }
  }

  if (!slowProvider.enabled) {
    throw new Error('Slow provider not configured');
  }

  const modelApiKey = slowProvider.apiKeysByModel[String(job.model || '').trim()] || slowProvider.apiKey;
  if (!modelApiKey) throw new Error(`No slow provider API key configured for model ${job.model || 'unknown'}`);
  const imageUrl = await callSlowImageGeneration(slowProvider.baseUrl, modelApiKey, job, signal);
  return {
    imageUrl,
    provider: 'slow',
    providerName: 'slow',
    sourceChannel: 'slow',
  };
}

/**
 * Build the call URL: if the job references a prompt (by prompt id), fetch the
 * prompt text first. Otherwise call with the given prompt directly.
 */
async function resolveJobPrompt(job) {
  // If the job has a promptId, fetch from the DB
  if (job.promptId) {
    try {
      const res = await fetch(`${process.env.SELF_URL || 'http://localhost:3001'}/api/prompts/${job.promptId}`);
      if (res.ok) {
        const data = await res.json();
        return data.prompt || job.prompt;
      }
    } catch { /* fall through */ }
  }
  return job.prompt;
}

// ─── Rate-limit-aware backoff ───────────────────────────────────────────────
const BACKOFF_CONFIG = {
  // Default per-attempt: base * 2^attempt (in ms), capped at max
  //  attempt 1 → 10s, attempt 2 → 20s, attempt 3 → 40s, ...
  baseMs: 10_000,
  maxMs: 5 * 60_000, // 5 min max

  // For 429 / concurrency limit: be much more aggressive
  rateLimitMultiplier: 6,   // multiply backoff by 6x on 429
  rateLimitMinMs: 30_000,   // at least 30s wait

  // For 502/503/upstream/no-channel: be less aggressive (60s cap vs 5min)
  upstreamMaxMs: 60_000,

  // For 429 / concurrency limit: be more aggressive
  rateLimitMinMs: 30_000,

  // Min time between starting two jobs (anti-hammering delay)
  minGapMs: 2000, // 2 seconds between starting jobs
  // Heartbeat when queue is idle/waiting (observability)
  heartbeatMs: 30_000,
};

function calcBackoffMs(attemptCount, error) {
  const msg = error?.message || '';
  const isRateLimit = /429|rate.?limit|concurrency.?exceeded/i.test(msg);
  const isUpstream  = /502|503|504|upstream|bad.?gateway|service.?unavailable/i.test(msg);
  const isTimeout   = /timeout|etimedout|econnreset|aborted/i.test(msg) || error?.status === 0;

  let base = BACKOFF_CONFIG.baseMs * Math.pow(2, attemptCount - 1);

  if (isRateLimit) {
    base = Math.max(BACKOFF_CONFIG.rateLimitMinMs, base * BACKOFF_CONFIG.rateLimitMultiplier);
  } else if (isUpstream) {
    base = Math.min(base * BACKOFF_CONFIG.upstreamMultiplier, BACKOFF_CONFIG.upstreamMaxMs);
  }

  return Math.min(base, BACKOFF_CONFIG.maxMs);
}

// ─── Semaphore ─────────────────────────────────────────────────────────────
function createSemaphore(permits) {
  let available = permits;
  const waiters = [];
  return {
    async acquire() {
      if (available > 0) {
        available--;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        waiters.push({ resolve, timestamp: Date.now() });
      });
    },
    release() {
      if (waiters.length > 0) {
        const w = waiters.shift();
        w.resolve();
      } else {
        available++;
      }
    },
    get running() { return permits - available; },
  };
}

// ─── Worker Loop ───────────────────────────────────────────────────────────
export function startGenQueueWorker({
  // Slow provider (legacy OpenAI-compatible)
  baseUrl,
  apiKey,
  apiKeysByModel = {},
  nanoImageProxyUrl = '',
  nanoImageModelMap = DEFAULT_NANO_IMAGE_MODEL_MAP,

  // Optional fast provider
  fastChannelsRaw = '',
  fastBaseUrl = '',
  fastBaseUrlCn = '',
  fastApiPath = '/v1/api/generate',
  fastResultPath = '/v1/api/result',
  fastApiKey = '',
  fastReplyType = 'json',
  fastModels = 'gpt-image-1',
  fastQualities = 'hd',
  fastMaxConcurrency = 0,
  forceFastForAll = false,

  pollIntervalMs = 1500,
  workerCount = 1,
  staleAfterMs = 5 * 60 * 1000,    // reclaim after 5 min stuck
  concurrency = 3,                  // max parallel API calls
  gapBetweenJobsMs = BACKOFF_CONFIG.minGapMs,
  logger = console,
}) {
  let stopped = false;
  const loops = [];
  const sem = createSemaphore(concurrency);

  const slowProvider = {
    enabled: Boolean(baseUrl && (apiKey || Object.keys(apiKeysByModel).length > 0)),
    baseUrl: String(baseUrl || '').trim(),
    apiKey: String(apiKey || '').trim(),
    apiKeysByModel: Object.fromEntries(
      Object.entries(apiKeysByModel || {})
        .map(([model, key]) => [String(model).trim(), String(key || '').trim()])
        .filter(([model, key]) => model && key),
    ),
  };

  const nanoProvider = {
    enabled: Boolean(
      nanoImageProxyUrl
      && baseUrl
      && Object.keys(apiKeysByModel || {}).length > 0,
    ),
    proxyUrl: String(nanoImageProxyUrl || '').trim(),
    upstreamBaseUrl: String(baseUrl || '').trim(),
    apiKeysByModel: Object.fromEntries(
      Object.entries(apiKeysByModel || {})
        .map(([model, key]) => [String(model).trim(), String(key || '').trim()])
        .filter(([model, key]) => model && key),
    ),
    modelMap: normalizeNanoImageModelMap(nanoImageModelMap),
  };

  const fastProviders = parseFastChannels(fastChannelsRaw, {
    fastBaseUrl,
    fastBaseUrlCn,
    fastApiPath,
    fastResultPath,
    fastApiKey,
    fastReplyType,
    fastModels,
    fastQualities,
    fastMaxConcurrency,
    forceFastForAll,
  });
  const fastProviderRuntime = buildFastProviderRuntime(fastProviders, concurrency, logger);

  const routing = {
    fastModels: normalizeCsvSet(fastModels),
    fastQualities: normalizeCsvSet(fastQualities),
    forceFastForAll: Boolean(forceFastForAll),
  };

  if (!slowProvider.enabled && fastProviders.length === 0) {
    logger.warn('[gen-queue] worker not started: no provider api key configured');
    return { stop() {}, wait() {} };
  }

  async function loop(workerId) {
    logger.info(`[gen-queue] worker-${workerId} started (concurrency=${concurrency})`);
    let lastStartTime = 0;
    let lastHeartbeatAt = 0;

    while (!stopped) {
      const nowForHeartbeat = Date.now();
      if (nowForHeartbeat - lastHeartbeatAt >= BACKOFF_CONFIG.heartbeatMs) {
        logger.info(`[gen-queue] heartbeat worker=${workerId} running=${sem.running}/${concurrency}`);
        lastHeartbeatAt = nowForHeartbeat;
      }

      // Reclaim jobs stuck in "running" for too long
      const reclaimed = reclaimStaleGenJobs({ staleAfterMs });
      if (reclaimed > 0) {
        logger.warn(`[gen-queue] reclaimed ${reclaimed} stale job(s)`);
      }

      // Respect gap between starting jobs (anti-hammering)
      const now = Date.now();
      const gapRemaining = gapBetweenJobsMs - (now - lastStartTime);
      if (gapRemaining > 0) {
        await sleep(Math.min(gapRemaining, pollIntervalMs));
        if (stopped) break;
      }

      // Try to acquire a semaphore slot
      if (sem.running >= concurrency) {
        await sleep(pollIntervalMs);
        continue;
      }

      const job = claimNextGenJob();
      if (!job) {
        await sleep(pollIntervalMs);
        continue;
      }

      // Acquire semaphore slot
      await sem.acquire();
      lastStartTime = Date.now();

      // Run job in background (don't await — let semaphore release after completion)
      runJob(job, sem, workerId, logger, slowProvider, fastProviders, routing);
    }
    logger.info(`[gen-queue] worker-${workerId} stopped`);
  }

  async function runJob(job, sem, workerId, logger, slowProvider, fastProviders, routing) {
    const controller = new AbortController();
    // Job-level timeout: 3 minutes
    const timeoutId = setTimeout(() => controller.abort(), 180_000);
    const startedAtMs = Date.now();
    let jobSourceChannel = String(job?.sourceChannel || '');
    let jobProviderName = String(job?.providerName || '');

    try {
      logger.info(`[gen-queue] job=${job.id} attempt=${job.attemptCount} start (running=${sem.running})`);

      // Resolve prompt text if job references a prompt id
      const resolvedPrompt = await resolveJobPrompt(job);
      const resolvedJob = { ...job, prompt: resolvedPrompt };

      const {
        imageUrl: resultImageUrl,
        provider,
        sourceChannel = '',
        providerName = '',
      } = await callImageGeneration({
        slowProvider,
        nanoProvider,
        fastProviders,
        fastProviderRuntime,
        routing,
        job: resolvedJob,
        signal: controller.signal,
        logger,
      });
      jobSourceChannel = String(sourceChannel || jobSourceChannel || '');
      jobProviderName = String(providerName || jobProviderName || '');
      const latencyMs = Math.max(1, Date.now() - startedAtMs);

      // Upload generated image to object storage (S4/R2) when configured.
      let finalImageUrl = resultImageUrl;
      try {
        const cs = await getCloudStorage();
        if (cs) {
          const key = `generated/${job.id}_${uuidv4()}.png`;
          finalImageUrl = await cs.resolveImageUrl(resultImageUrl, key);
          logger.info(`[gen-queue] job=${job.id} uploaded to object storage: ${finalImageUrl}`);
        }
      } catch (uploadErr) {
        // Fall back to the original URL if storage upload fails (don't lose the image)
        logger.warn(`[gen-queue] job=${job.id} storage upload failed, using original URL: ${uploadErr.message}`);
      }

      markGenJobSucceeded(job.id, finalImageUrl, {
        sourceChannel: jobSourceChannel,
        providerName: jobProviderName || provider,
        latencyMs,
      });
      addHistory({
        imageUrl: finalImageUrl,
        // Persist the resolved prompt text (not the raw job payload),
        // so history/prompts stay aligned with what was actually generated.
        prompt: resolvedJob.prompt,
        model: job.model,
        mode: job.mode,
        userId: job.userId || null,
        jobId: job.id,
        category: job.category || job.heartbeatCategory || '',
        publishToPrompts: !!job.publishToPrompts,
      });

      // ── Editor Batch callbacks ─────────────────────────────────────────────────
      // If this job belongs to an editor_batch workflow (heartbeatKind='editor_showcase'),
      // advance the editor_items state machine.
      // Always publish on success (even after retries) — the retry will eventually succeed
      // and succeed-path publishes once. Failed-path only marks permanently failed when
      // attemptCount >= maxAttempts so retries keep step2_status='queued'.
      if (job.heartbeatKind === 'editor_showcase') {
        if (job.mode === 'text') {
          // Step 1 succeeded → enqueue step2, update editor_items
          try {
            advanceEditorItemFromStep1(job.id, finalImageUrl);
            logger.info(`[gen-queue] job=${job.id} step1→step2 enqueued (editor_showcase)`);
          } catch (err) {
            logger.warn(`[gen-queue] job=${job.id} advanceEditorItemFromStep1 failed: ${err.message}`);
          }
        } else if (job.mode === 'edit') {
          // Step 2 succeeded → upload to storage + publish to prompts
          try {
            await advanceEditorItemFromStep2(job.id, finalImageUrl);
            logger.info(`[gen-queue] job=${job.id} step2→published (editor_showcase)`);
          } catch (err) {
            logger.warn(`[gen-queue] job=${job.id} advanceEditorItemFromStep2 failed: ${err.message}`);
          }
        }
      }

      logger.info(`[gen-queue] job=${job.id} succeeded via ${provider}`);
    } catch (err) {
      clearTimeout(timeoutId);
      const backoffMs = calcBackoffMs(job.attemptCount + 1, err);
      const latencyMs = Math.max(1, Date.now() - startedAtMs);
      const rawMessage = typeof err?.message === 'string' ? err.message : String(err || 'unknown error');
      const finalMessage = (err?.name === 'AbortError' || rawMessage.includes('timeout'))
        ? `Job timed out after 180s: ${rawMessage}`
        : rawMessage;

      logger.warn(`[gen-queue] job=${job.id} failed (attempt=${job.attemptCount + 1}): ${finalMessage} — backoff=${Math.round(backoffMs / 1000)}s`);
      markGenJobFailed(job.id, finalMessage, {
        retryDelayMs: backoffMs,
        sourceChannel: jobSourceChannel,
        providerName: jobProviderName,
        latencyMs,
      });

      // ── Editor Batch failure callbacks ────────────────────────────────────────
      // Only mark editor_item permanently failed when the job is truly exhausted
      // (attemptCount >= maxAttempts). During retry cycles, let the item stay
      // step1_status='pending' so step2 is NOT blocked — when step1 finally succeeds,
      // advanceEditorItemFromStep1 enqueues step2 and updates step2_status='queued'.
      if (job.heartbeatKind === 'editor_showcase') {
        const exhausted = job.attemptCount >= (job.maxAttempts || 2) - 1;
        if (job.mode === 'text') {
          if (exhausted) {
            try {
              markEditorItemStep1Failed(job.id);
              logger.info(`[gen-queue] job=${job.id} step1 permanently failed, marked editor_item failed`);
            } catch (err) {
              logger.warn(`[gen-queue] job=${job.id} markEditorItemStep1Failed failed: ${err.message}`);
            }
          } else {
            logger.info(`[gen-queue] job=${job.id} step1 failed, will retry (exhausted=${exhausted})`);
          }
        } else if (job.mode === 'edit') {
          // markEditorItemStep2Failed handles exhaustion internally:
          // - exhausted (attempt_count >= max_attempts): step2_status='failed'
          // - retryable: step2_status stays 'pending' so it requeues on next batch
          try {
            markEditorItemStep2Failed(job.id, finalMessage);
            logger.info(`[gen-queue] job=${job.id} step2 marked ${job.attemptCount >= (job.maxAttempts || 2) - 1 ? 'failed' : 'pending (will retry)'}`);
          } catch (err) {
            logger.warn(`[gen-queue] job=${job.id} markEditorItemStep2Failed failed: ${err.message}`);
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      sem.release();
    }
  }

  for (let i = 0; i < Math.max(1, workerCount); i++) {
    loops.push(loop(i + 1));
  }

  return {
    stop() { stopped = true; },
    wait() { return Promise.allSettled(loops); },
  };
}
