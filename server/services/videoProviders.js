import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UPLOADS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads');
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

const LOGICAL_MODEL_FAMILIES = {
  video_h3: {
    family: 'h3',
    label: 'MiniMax H3',
    shortLabel: 'H3',
    capability: '视频 · 参考图',
    mode: 'multi_ref',
    maxReferenceImages: 9,
    resolutions: ['480p', '720p', '768p', '1080p'],
    durations: Array.from({ length: 27 }, (_, index) => index + 4),
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  video_seedance_2_fast: {
    family: 'seedance_2_fast',
    label: 'Seedance 2.0 Fast',
    shortLabel: 'Seedance Fast',
    capability: '视频 · 快速生成',
    mode: 'multi_ref',
    maxReferenceImages: 9,
    resolutions: ['480p', '720p'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  video_seedance_2: {
    family: 'seedance_2',
    label: 'Seedance 2.0',
    shortLabel: 'Seedance 2.0',
    capability: '视频 · 满血',
    mode: 'multi_ref',
    maxReferenceImages: 9,
    resolutions: ['480p', '720p'],
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  video_seedance_2_5: {
    family: 'seedance_2_5',
    label: 'Seedance 2.5',
    shortLabel: 'Seedance 2.5',
    capability: '视频 · 满血参考',
    mode: 'multi_ref',
    maxReferenceImages: 9,
    resolutions: ['720p', '1080p'],
    durations: Array.from({ length: 27 }, (_, index) => index + 4),
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
  video_wan_3: {
    family: 'wan_3',
    label: 'Wan 3.0',
    shortLabel: 'Wan 3.0',
    capability: '视频 · 480P/720P/1080P',
    mode: 'multi_ref',
    maxReferenceImages: 9,
    resolutions: ['480p', '720p', '1080p'],
    durations: Array.from({ length: 29 }, (_, index) => index + 2),
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
  },
};

const LEGACY_MODEL_ALIASES = {
  minimax_h3_v2: 'video_h3',
  minimax_h3_multi_ref: 'video_h3',
  h3: 'video_h3',
  'minimax-h3': 'video_h3',
  'seedance-2.0-fast': 'video_seedance_2_fast',
  'seedance-2-fast': 'video_seedance_2_fast',
  'seedance-2.0': 'video_seedance_2',
  seedance2: 'video_seedance_2',
  'seedance-2.5': 'video_seedance_2_5',
  seedance25: 'video_seedance_2_5',
  wan3: 'video_wan_3',
  'wan-3.0': 'video_wan_3',
};

const DEFAULT_PROVIDER_MODELS = {
  foke: {
    h3: 'ft-video-v1-1eb6d53a32efa02adf7ae338f3239628',
    seedance_2_fast: 'ft-video-v1-48ab2a888e15eca3c04385ea06fd43c1',
    seedance_2: 'ft-video-v1-dd97afc97a7c3cba8e78a6e429933597',
    seedance_2_5: 'ft-video-v1-1795bf4b67ce998dbfd8ab55cf838d93',
    wan_3: 'ft-video-v1-3c36fd760ae3659507ab841b317e1cf8',
  },
  yio: {
    h3: 'minimaxh3',
    seedance_2_fast: 'koko-sd20-fast',
    seedance_2: 'koko-sd20',
    seedance_2_5: 'mili-seedance25',
    wan_3: 'yk-wan3.0-pro-a',
  },
  heziai: {
    h3: '【特惠版】h3-768p（按次）',
    seedance_2_fast: '特价渠道 Seedance 2.0 fast 720p（900）',
    seedance_2: '官方渠道-Seedance 2.0 满血 720p',
    seedance_2_5: 'Seedance 2.5 满血 480-720p',
    wan_3: '【api调用】wan-3.0-1080p',
  },
};

const FALLBACK_PRICES_CNY = {
  foke: {
    h3: { amount: 0.06, unit: 'second' },
    seedance_2_fast: { amount: 1, unit: 'request' },
    seedance_2: { amount: 1, unit: 'request' },
    seedance_2_5: { amount: 1.8, unit: 'request' },
    wan_3: { amount: 3.5, unit: 'request' },
  },
  yio: {
    h3: { amount: 1.5, unit: 'request' },
    seedance_2_fast: { amount: 1.7, unit: 'request' },
    seedance_2: { amount: 1.9, unit: 'request' },
    seedance_2_5: { amount: 4.8, unit: 'request' },
    wan_3: { amount: 3, unit: 'request' },
  },
  heziai: {
    h3: { amount: 0.7, unit: 'request' },
    seedance_2_fast: { amount: 1.5, unit: 'request' },
    seedance_2: { amount: 2.5, unit: 'request' },
    seedance_2_5: { amount: 4.5, unit: 'request' },
    wan_3: { amount: 3, unit: 'request' },
  },
};

const modelCache = new Map();

export class VideoProviderError extends Error {
  constructor(message, { provider, status, mayHaveSubmitted = false } = {}) {
    super(message);
    this.name = 'VideoProviderError';
    this.provider = provider || '';
    this.status = status;
    this.mayHaveSubmitted = mayHaveSubmitted;
  }
}

function trim(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function parseJsonBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text.trim();
  }
}

function pickError(payload) {
  if (typeof payload === 'string') return payload;
  return payload?.error?.message
    || payload?.error
    || payload?.message
    || payload?.detail
    || payload?.errorMessage
    || payload?.data?.error
    || payload?.data?.message
    || payload?.choices?.[0]?.message?.content
    || '';
}

function pickTaskId(payload) {
  const values = [
    payload?.jobId,
    payload?.job_id,
    payload?.taskId,
    payload?.task_id,
    payload?.id,
    payload?.data?.jobId,
    payload?.data?.job_id,
    payload?.data?.taskId,
    payload?.data?.task_id,
    payload?.data?.id,
    payload?.result?.jobId,
    payload?.result?.job_id,
    payload?.result?.taskId,
    payload?.result?.task_id,
    payload?.result?.id,
    payload?.video?.id,
    payload?.choices?.[0]?.message?.tool_calls?.[0]?.id,
  ];
  return values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

function pickVideoUrl(payload) {
  if (typeof payload === 'string') {
    const match = payload.match(/https?:\/\/[^\s"'<>]+/);
    return match?.[0] || '';
  }
  const candidates = [
    payload?.videoUrl,
    payload?.video_url,
    payload?.video,
    payload?.url,
    payload?.contentUrl,
    payload?.content_url,
    payload?.file_url,
    payload?.fileUrl,
    payload?.output,
    payload?.video?.url,
    payload?.video?.videoUrl,
    payload?.video?.video_url,
    payload?.video?.content_url,
    payload?.result?.videoUrl,
    payload?.result?.video_url,
    payload?.result?.url,
    payload?.result?.video?.url,
    payload?.result?.video?.videoUrl,
    payload?.result?.video?.video_url,
    payload?.data?.videoUrl,
    payload?.data?.video_url,
    payload?.data?.url,
    payload?.data?.video?.url,
    payload?.data?.video?.videoUrl,
    payload?.data?.video?.video_url,
    payload?.choices?.[0]?.message?.content,
  ];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const match = value.match(/https?:\/\/[^\s"'<>]+/);
    if (match?.[0]) return match[0].replace(/[),.;]+$/, '');
  }
  return '';
}

function getStatus(payload) {
  return String(
    payload?.status
      || payload?.state
      || payload?.task_status
      || payload?.data?.status
      || payload?.data?.state
      || payload?.result?.status
      || 'queued',
  ).toLowerCase();
}

function isComplete(payload) {
  return ['completed', 'complete', 'succeeded', 'success', 'done', 'finished', 'ready'].includes(getStatus(payload));
}

function isFailed(payload) {
  return ['failed', 'error', 'cancelled', 'canceled'].includes(getStatus(payload));
}

function resolveFamily(model) {
  const raw = String(model || '').trim();
  if (LOGICAL_MODEL_FAMILIES[raw]) return raw;
  const alias = LEGACY_MODEL_ALIASES[raw.toLowerCase()];
  if (alias) return alias;
  if (/wan/i.test(raw)) return 'video_wan_3';
  if (/seedance.*2\.5|2\.5.*seedance|sd25/i.test(raw)) return 'video_seedance_2_5';
  if (/seedance.*fast|fast.*seedance|sd20.*fast/i.test(raw)) return 'video_seedance_2_fast';
  if (/seedance.*2|sd20/i.test(raw)) return 'video_seedance_2';
  if (/h3|minimax/i.test(raw)) return 'video_h3';
  return 'video_h3';
}

function getProviderConfig() {
  const providerOrder = String(process.env.VIDEO_PROVIDER_ORDER || 'foke,yio,heziai,legacy')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return {
    order: [...new Set(providerOrder)],
    foke: {
      apiKey: trim(process.env.VIDEO_FOKE_API_KEY),
      baseUrl: trim(process.env.VIDEO_FOKE_BASE_URL || 'https://ai.fanke2026.xyz/api/open/v1').replace(/\/+$/, ''),
      publicModelIds: String(process.env.VIDEO_FOKE_PUBLIC_MODEL_IDS || '1'),
    },
    yio: {
      apiKey: trim(process.env.VIDEO_YIO_API_KEY),
      baseUrl: trim(process.env.VIDEO_YIO_BASE_URL || 'https://yioapp.top/openapi/v1').replace(/\/+$/, ''),
    },
    heziai: {
      apiKey: trim(process.env.VIDEO_HEZIAI_API_KEY),
      baseUrl: trim(process.env.VIDEO_HEZIAI_BASE_URL || 'https://api.heziai.cc/v1').replace(/\/+$/, ''),
      statusPath: trim(process.env.VIDEO_HEZIAI_STATUS_PATH || '/videos/{id}'),
    },
    legacy: {
      apiKey: trim(process.env.VIDEO_API_KEY || process.env.VIDEO_CARD_KEY),
      baseUrl: trim(process.env.VIDEO_API_BASE_URL || 'https://www.runlive.top/mnmx').replace(/\/+$/, ''),
      taskPath: trim(process.env.VIDEO_API_TASK_PATH || '/api/v1/tasks'),
      taskName: trim(process.env.VIDEO_API_TASK_NAME || 'minimax_h3_v2'),
    },
  };
}

function modelIdFor(provider, family) {
  const envName = `VIDEO_${provider.toUpperCase()}_MODEL_${family.toUpperCase()}`;
  return trim(process.env[envName] || DEFAULT_PROVIDER_MODELS[provider]?.[family]);
}

function headersFor(provider, config) {
  if (provider === 'foke') {
    return {
      Authorization: `Bearer ${config.foke.apiKey}`,
      'X-Public-Model-Ids': config.foke.publicModelIds,
      'Content-Type': 'application/json',
    };
  }
  return {
    Authorization: `Bearer ${config[provider].apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function requestJson(
  url,
  options,
  {
    provider,
    timeoutMs = 90000,
    mayHaveSubmitted = false,
    signal,
  } = {},
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const parentSignal = signal || options?.signal;
  const abortFromParent = () => {
    if (!controller.signal.aborted) controller.abort(parentSignal.reason);
  };
  if (parentSignal) {
    if (parentSignal.aborted) abortFromParent();
    else parentSignal.addEventListener('abort', abortFromParent, { once: true });
  }
  try {
    let response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (parentSignal?.aborted) throw error;
      throw new VideoProviderError(
        error?.name === 'AbortError' ? '视频生成请求超时' : `视频生成网络请求失败：${error.message}`,
        { provider, mayHaveSubmitted },
      );
    }
    const text = await response.text();
    const payload = parseJsonBody(text);
    if (!response.ok) {
      const reason = pickError(payload) || text.slice(0, 300);
      throw new VideoProviderError(
        `视频生成请求失败（HTTP ${response.status}）：${String(reason).slice(0, 300)}`,
        { provider, status: response.status },
      );
    }
    return payload;
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

async function fetchProviderModels(provider, config) {
  const cached = modelCache.get(provider);
  if (cached && cached.expiresAt > Date.now()) return cached.models;
  if (!config[provider]?.apiKey) return [];

  let payload;
  if (provider === 'foke') {
    payload = await requestJson(`${config.foke.baseUrl}/models`, {
      headers: headersFor(provider, config),
    }, { provider });
  } else if (provider === 'yio') {
    payload = await requestJson(`${config.yio.baseUrl}/models`, {
      headers: headersFor(provider, config),
    }, { provider });
  } else if (provider === 'heziai') {
    payload = await requestJson(`${config.heziai.baseUrl}/models`, {
      headers: headersFor(provider, config),
    }, { provider });
  } else {
    return [];
  }

  const models = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.models)
      ? payload.models
      : [];
  modelCache.set(provider, { models, expiresAt: Date.now() + MODEL_CACHE_TTL_MS });
  return models;
}

function modelFromCatalog(provider, models, modelId) {
  return models.find(item => (
    String(item?.id || item?.code || item?.model || '').trim() === modelId
  )) || null;
}

function isModelAvailable(provider, item) {
  if (!item) return provider === 'heziai';
  if (provider === 'foke') return ['available', 'replenishing'].includes(String(item.status || '').toLowerCase());
  if (provider === 'yio') return item.enabled !== false && item.maintenance !== true;
  return item.enabled !== false && item.maintenance !== true;
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function priceFor(provider, family, item, duration, resolution) {
  const fallback = FALLBACK_PRICES_CNY[provider]?.[family];
  if (!item) return fallback ? {
    amount: fallback.unit === 'second' ? fallback.amount * duration : fallback.amount,
    currency: 'CNY',
    unit: fallback.unit,
  } : null;

  const durationNumber = Number(duration) || 5;
  const resolutionPrices = item.resolution_prices || item.resolutionPrices || {};
  const resolutionPrice = resolutionPrices[resolution];
  if (resolutionPrice) {
    const amount = toNumber(resolutionPrice.amount ?? resolutionPrice);
    if (amount !== null) {
      return {
        amount: resolutionPrice.unit === 'second' ? amount * durationNumber : amount,
        currency: resolutionPrice.currency || 'CNY',
        unit: resolutionPrice.unit || 'request',
      };
    }
  }

  const durationPrices = item.duration_prices || item.durationPrices || {};
  const durationPrice = durationPrices[String(durationNumber)] ?? durationPrices[durationNumber];
  if (durationPrice !== undefined && durationPrice !== null) {
    const amount = toNumber(durationPrice.amount ?? durationPrice);
    if (amount !== null) {
      return {
        amount: durationPrice.unit === 'second' ? amount * durationNumber : amount,
        currency: durationPrice.currency || 'CNY',
        unit: durationPrice.unit || 'request',
      };
    }
  }

  const rawPrice = provider === 'foke'
    ? item.price
    : {
        amount: item.customerPrice ?? item.normalPrice ?? item.price,
        unit: 'request',
      };
  const amount = toNumber(rawPrice?.amount ?? rawPrice);
  if (amount === null) return fallback ? {
    amount: fallback.unit === 'second' ? fallback.amount * durationNumber : fallback.amount,
    currency: 'CNY',
    unit: fallback.unit,
  } : null;
  return {
    amount: rawPrice?.unit === 'second' ? amount * durationNumber : amount,
    currency: rawPrice?.currency || 'CNY',
    unit: rawPrice?.unit || 'request',
  };
}

function listValues(item, ...keys) {
  for (const key of keys) {
    if (Array.isArray(item?.[key]) && item[key].length > 0) return item[key];
  }
  return [];
}

function supportsRequest(provider, item, profile, { duration, resolution, referenceCount }) {
  if (!item) return provider === 'heziai';
  const durations = listValues(item, 'durations');
  const resolutions = listValues(item, 'resolutions');
  const maxImages = toNumber(item.max_image_refs ?? item.maxReferenceImages);
  if (duration !== undefined && durations.length > 0 && !durations.includes(Number(duration))) return false;
  if (resolution && resolutions.length > 0 && !resolutions.includes(resolution)) return false;
  const resolutionDurations = item.resolution_durations || item.resolutionDurations || {};
  if (
    duration !== undefined
    && resolution
    && Array.isArray(resolutionDurations[resolution])
    && !resolutionDurations[resolution].map(Number).includes(Number(duration))
  ) return false;
  if (maxImages !== null && referenceCount > maxImages) return false;
  if (!durations.length && profile.durations.length > 0 && duration !== undefined && !profile.durations.includes(Number(duration))) {
    return false;
  }
  return true;
}

function chooseResolution(item, profile, requested) {
  const supported = listValues(item, 'resolutions');
  if (requested && (supported.length === 0 || supported.includes(requested))) return requested;
  if (supported.length > 0) return supported.includes('720p') ? '720p' : supported[0];
  if (requested && profile.resolutions.includes(requested)) return requested;
  return profile.resolutions.includes('720p') ? '720p' : profile.resolutions[0];
}

function chooseDuration(item, profile, requested) {
  const supported = listValues(item, 'durations').map(Number).filter(Number.isFinite);
  if (requested !== undefined && requested !== null) {
    if (supported.length === 0 || supported.includes(Number(requested))) return Number(requested);
    return null;
  }
  if (supported.length > 0) return supported.includes(5) ? 5 : supported[0];
  return profile.durations.includes(5) ? 5 : profile.durations[0];
}

function candidateLabel(provider, profile, item, modelId) {
  return `视频生成任务 · ${trim(item?.name || item?.displayName || modelId, 100) || profile.label}`;
}

export function getLogicalVideoModel(model) {
  const id = resolveFamily(model);
  return {
    id,
    ...LOGICAL_MODEL_FAMILIES[id],
  };
}

export function getLogicalVideoModels() {
  return Object.entries(LOGICAL_MODEL_FAMILIES).map(([value, profile]) => ({
    value,
    ...profile,
  }));
}

export function getVideoProviderOrder() {
  return getProviderConfig().order;
}

export async function getVideoCandidates({
  model,
  duration,
  resolution,
  referenceCount = 0,
}) {
  const config = getProviderConfig();
  const logical = getLogicalVideoModel(model);
  const candidates = [];

  for (const provider of config.order) {
    if (!['foke', 'yio', 'heziai'].includes(provider)) continue;
    if (!config[provider]?.apiKey) continue;
    const modelId = modelIdFor(provider, logical.family);
    if (!modelId) continue;

    let catalog = [];
    try {
      catalog = await fetchProviderModels(provider, config);
    } catch (error) {
      candidates.push({
        provider,
        family: logical.family,
        model: modelId,
        label: '视频生成任务 · 模型信息读取失败',
        unavailableReason: error.message,
      });
      continue;
    }
    const item = modelFromCatalog(provider, catalog, modelId);
    if (!isModelAvailable(provider, item)) continue;
    if (!supportsRequest(provider, item, logical, { duration, resolution, referenceCount })) continue;
    const selectedDuration = chooseDuration(item, logical, duration);
    if (selectedDuration === null) continue;
    const selectedResolution = chooseResolution(item, logical, resolution);
    if (!supportsRequest(provider, item, logical, {
      duration: selectedDuration,
      resolution: selectedResolution,
      referenceCount,
    })) continue;
    candidates.push({
      provider,
      family: logical.family,
      model: modelId,
      label: candidateLabel(provider, logical, item, modelId),
      item,
      duration: selectedDuration,
      resolution: selectedResolution,
      price: priceFor(provider, logical.family, item, selectedDuration, selectedResolution),
      maxReferenceImages: toNumber(item?.max_image_refs ?? item?.maxReferenceImages) ?? logical.maxReferenceImages,
    });
  }

  return candidates
    .filter(candidate => !candidate.unavailableReason)
    .sort((left, right) => {
      return config.order.indexOf(left.provider) - config.order.indexOf(right.provider);
    });
}

async function loadReferenceForMultipart(referenceUrl) {
  if (!referenceUrl) return null;
  if (referenceUrl.startsWith('data:image/')) {
    const match = referenceUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('参考图片 data URL 无效');
    return {
      buffer: Buffer.from(match[2], 'base64'),
      mimeType: match[1] || 'image/jpeg',
      filename: 'reference.jpg',
    };
  }
  if (!referenceUrl.startsWith('/uploads/')) return null;
  const relativePath = decodeURIComponent(referenceUrl.slice('/uploads/'.length));
  const filePath = path.resolve(UPLOADS_DIR, relativePath);
  const uploadsRoot = `${path.resolve(UPLOADS_DIR)}${path.sep}`;
  if (!filePath.startsWith(uploadsRoot)) throw new Error('参考图片路径无效');
  const extension = path.extname(filePath).toLowerCase();
  const mimeType = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }[extension] || 'image/jpeg';
  return {
    buffer: await readFile(filePath),
    mimeType,
    filename: path.basename(filePath),
  };
}

async function loadReferenceAsDataUrl(referenceUrl) {
  if (!referenceUrl || /^https?:\/\//i.test(referenceUrl) || referenceUrl.startsWith('data:')) {
    return referenceUrl;
  }
  const file = await loadReferenceForMultipart(referenceUrl);
  if (!file) return referenceUrl;
  return `data:${file.mimeType};base64,${file.buffer.toString('base64')}`;
}

async function buildFokeRequest(candidate, request, config, signal) {
  const common = {
    model: candidate.model,
    prompt: request.prompt,
    ratio: request.aspectRatio,
    duration: candidate.duration,
    resolution: candidate.resolution,
    imageUrls: request.referenceImages.filter(url => /^https?:\/\//i.test(url)),
    videoUrls: [],
    audioUrls: [],
  };
  const localImages = [];
  for (const url of request.referenceImages) {
    const file = await loadReferenceForMultipart(url);
    if (file) localImages.push(file);
  }
  if (localImages.length === 0) {
    return {
      url: `${config.foke.baseUrl}/video/generate`,
      options: {
        method: 'POST',
        headers: {
          ...headersFor('foke', config),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(common),
        signal,
      },
    };
  }

  const form = new FormData();
  form.append('model', common.model);
  form.append('prompt', common.prompt);
  form.append('ratio', common.ratio);
  form.append('duration', String(common.duration));
  form.append('resolution', common.resolution);
  for (const file of localImages) {
    form.append('images', new Blob([file.buffer], { type: file.mimeType }), file.filename);
  }
  return {
    url: `${config.foke.baseUrl}/video/generate`,
    options: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.foke.apiKey}`,
        'X-Public-Model-Ids': config.foke.publicModelIds,
      },
      body: form,
      signal,
    },
  };
}

async function submitFoke(candidate, request, config, signal, timeoutMs) {
  const { url, options } = await buildFokeRequest(candidate, request, config, signal);
  const payload = await requestJson(url, options, {
    provider: 'foke',
    mayHaveSubmitted: true,
    timeoutMs,
    signal,
  });
  const taskId = pickTaskId(payload);
  const videoUrl = pickVideoUrl(payload);
  if (!taskId && !videoUrl) {
    throw new VideoProviderError('视频生成服务返回无效结果', { provider: 'foke' });
  }
  return {
    taskId: taskId || `direct-${Date.now()}`,
    status: videoUrl ? 'completed' : getStatus(payload),
    url: videoUrl,
    raw: payload,
  };
}

async function submitYio(candidate, request, config, signal, timeoutMs) {
  const imageUrls = await Promise.all(
    request.referenceImages.map(loadReferenceAsDataUrl),
  );
  const payload = await requestJson(`${config.yio.baseUrl}/videos`, {
    method: 'POST',
    headers: headersFor('yio', config),
    body: JSON.stringify({
      model: candidate.model,
      prompt: request.prompt,
      duration: candidate.duration,
      ratio: request.aspectRatio,
      resolution: candidate.resolution,
      image_urls: imageUrls,
      video_urls: [],
      audio_urls: [],
    }),
    signal,
  }, { provider: 'yio', mayHaveSubmitted: true, timeoutMs, signal });
  const taskId = pickTaskId(payload);
  const videoUrl = pickVideoUrl(payload);
  if (!taskId && !videoUrl) {
    throw new VideoProviderError('视频生成服务返回无效结果', { provider: 'yio' });
  }
  return {
    taskId: taskId || `direct-${Date.now()}`,
    status: videoUrl ? 'completed' : getStatus(payload),
    url: videoUrl,
    raw: payload,
  };
}

async function submitHezi(candidate, request, config, signal, timeoutMs) {
  const imageUrls = await Promise.all(
    request.referenceImages.map(loadReferenceAsDataUrl),
  );
  const payload = await requestJson(`${config.heziai.baseUrl}/videos`, {
    method: 'POST',
    headers: headersFor('heziai', config),
    body: JSON.stringify({
      model: candidate.model,
      prompt: request.prompt,
      seconds: candidate.duration,
      duration: candidate.duration,
      ratio: request.aspectRatio,
      resolution: candidate.resolution,
      image_urls: imageUrls,
      size: videoSizeFor(candidate.resolution, request.aspectRatio),
    }),
    signal,
  }, { provider: 'heziai', mayHaveSubmitted: true, timeoutMs, signal });
  const taskId = pickTaskId(payload);
  const videoUrl = pickVideoUrl(payload);
  if (!taskId && !videoUrl) {
    throw new VideoProviderError('视频生成服务返回无效结果', { provider: 'heziai' });
  }
  return {
    taskId: taskId || `direct-${Date.now()}`,
    status: videoUrl ? 'completed' : getStatus(payload),
    url: videoUrl,
    raw: payload,
  };
}

function videoSizeFor(resolution, aspectRatio) {
  const sizes = {
    '480p': {
      '16:9': '832x480',
      '9:16': '480x832',
      '1:1': '480x480',
      '4:3': '640x480',
      '3:4': '480x640',
    },
    '720p': {
      '16:9': '1280x720',
      '9:16': '720x1280',
      '1:1': '720x720',
      '4:3': '960x720',
      '3:4': '720x960',
    },
    '768p': {
      '16:9': '1366x768',
      '9:16': '768x1366',
      '1:1': '768x768',
      '4:3': '1024x768',
      '3:4': '768x1024',
    },
    '1080p': {
      '16:9': '1920x1080',
      '9:16': '1080x1920',
      '1:1': '1080x1080',
      '4:3': '1440x1080',
      '3:4': '1080x1440',
    },
  };
  const resolutionKey = String(resolution || '').toLowerCase();
  const ratioKey = String(aspectRatio || '16:9');
  return sizes[resolutionKey]?.[ratioKey] || sizes['720p'][ratioKey] || sizes['720p']['16:9'];
}

export async function submitVideoProviderTask({
  candidate,
  request,
  timeoutMs = 90000,
  signal,
}) {
  const config = getProviderConfig();
  if (signal?.aborted) throw signal.reason || new Error('视频生成请求已取消');
  if (candidate.provider === 'foke') return submitFoke(candidate, request, config, signal, timeoutMs);
  if (candidate.provider === 'yio') return submitYio(candidate, request, config, signal, timeoutMs);
  if (candidate.provider === 'heziai') return submitHezi(candidate, request, config, signal, timeoutMs);
  throw new VideoProviderError('视频生成任务不可用', { provider: candidate.provider });
}

function providerStatusUrl(provider, taskId, config) {
  if (provider === 'foke') {
    const url = new URL(`${config.foke.baseUrl}/video/status`);
    url.searchParams.set('jobId', taskId);
    url.searchParams.set('_t', String(Date.now()));
    return url.toString();
  }
  if (provider === 'yio') return `${config.yio.baseUrl}/videos/${encodeURIComponent(taskId)}`;
  return `${config.heziai.baseUrl}${config.heziai.statusPath.replace('{id}', encodeURIComponent(taskId))}`;
}

export async function refreshVideoProviderTask({ provider, taskId }) {
  const config = getProviderConfig();
  const payload = await requestJson(providerStatusUrl(provider, taskId, config), {
    headers: headersFor(provider, config),
  }, { provider });
  if (isFailed(payload)) {
    return {
      status: 'failed',
      error: pickError(payload) || '视频生成任务失败',
      raw: payload,
    };
  }
  const videoUrl = pickVideoUrl(payload);
  if (videoUrl && (isComplete(payload) || !pickTaskId(payload))) {
    return {
      status: 'completed',
      url: videoUrl,
      raw: payload,
    };
  }
  return {
    status: getStatus(payload),
    url: '',
    raw: payload,
  };
}

export function getStaticVideoModelCapabilities(model) {
  const logical = getLogicalVideoModel(model);
  return {
    model: logical.id,
    family: logical.family,
    mode: logical.mode,
    maxReferenceImages: logical.maxReferenceImages,
    referenceFields: Array.from({ length: logical.maxReferenceImages }, (_, index) => `image_${index}`),
    resolutions: logical.resolutions,
    durations: logical.durations,
    aspectRatios: logical.aspectRatios,
  };
}
