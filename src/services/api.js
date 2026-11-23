const BASE = '/api';

function sanitizePublicErrorText(value) {
  return String(value || '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, '生成服务')
    .replace(/\bHTTP\s+\d{3}:[^\n；;]*/gi, '生成服务')
    .replace(/no available (?:compatible accounts|channel[^。\n；;]*)/gi, '生成服务暂时不可用')
    .replace(/\b(?:foke|fanke2026|yio|heziai|runlive|legacy|code2alita|crantai|rsxermu666|feituokuajing|zhouyang168|tokenx24|d1api)\b/gi, '生成服务')
    .replace(/\b(?:VIDEO|OPENAI|DEEPSEEK)_[A-Z0-9_]+\b/gi, '内部配置')
    .replace(/视频生成任务\s*[·|-]\s*[^\n；;:：]+/g, '视频生成服务')
    .replace(/\b(?:fast|slow|nano)\s+provider\b/gi, '生成服务')
    .replace(/视频渠道|视频供应商|供应商/g, '视频生成服务');
}

const PUBLIC_MEDIA_KEYS = new Set([
  'url',
  'src',
  'imageUrl',
  'videoUrl',
  'referenceImageUrl',
  'resultImageUrl',
  'sourceUrl',
  'resultUrl',
  'fileUrl',
  'source_url',
  'result_url',
  'file_url',
]);
const BLOCKED_PUBLIC_MEDIA_HOSTS = [
  'rsxermu666.cn',
  'img.rsxermu666.cn',
  'crantai.com',
  'image.crantai.com',
  'code2alita.com',
  'fanke2026.xyz',
  'ai.fanke2026.xyz',
  'yioapp.top',
  'api.heziai.cc',
  'runlive.top',
  'feituokuajing.oss-cn-hongkong.aliyuncs.com',
  'zhouyang168.top',
  'tokenx24.com',
  'd1api.xin',
];
const INTERNAL_RESPONSE_KEYS = new Set([
  'provider',
  'providername',
  'providermodel',
  'sourcechannel',
  'source_channel',
  'preferredchannel',
  'preferred_channel',
  'channel',
  'channelplan',
  'baseurl',
  'base_url',
  'baseurls',
  'base_urls',
  'endpoint',
  'apiurl',
  'api_url',
  'raw',
  'rawjson',
  'raw_json',
  'rawresponse',
  'raw_response',
  'request',
  'response',
  'candidate',
  'candidates',
  'sourceurl',
  'source_url',
  'resulturl',
  'result_url',
  'fileurl',
  'file_url',
]);

function sanitizeAgentPayload(value, key = '', preserveText = false) {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeAgentPayload(item, key, preserveText));
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && PUBLIC_MEDIA_KEYS.has(key) && /^https?:\/\//i.test(value)) {
      return '';
    }
    if (preserveText) return value;
    if (typeof value !== 'string') return value;
    // 空串不要变成「生成服务暂时不可用」之类的占位文案。
    return value.trim() ? sanitizePublicErrorText(value) : '';
  }
  const out = {};
  const preserveMessage = value.messageKind === 'assistant_text';
  const preserveEventText = value.textKind === 'assistant_text';
  for (const [key, raw] of Object.entries(value)) {
    if (INTERNAL_RESPONSE_KEYS.has(String(key).toLowerCase())) continue;
    if (
      (preserveMessage && key === 'message')
      || (preserveEventText && key === 'text')
    ) {
      out[key] = raw;
      continue;
    }
    if (
      ['error', 'message', 'summary', 'title', 'label', 'meta'].includes(key)
      && typeof raw === 'string'
    ) {
      out[key] = sanitizePublicErrorText(raw);
    } else {
      out[key] = sanitizeAgentPayload(raw, key);
    }
  }
  return out;
}

function normalizeImageLikeUrl(raw, type = 'image') {
  const url = String(raw || '').trim();
  if (!url) return url;
  try {
    const hostname = new URL(url, window.location.origin).hostname.toLowerCase();
    if (BLOCKED_PUBLIC_MEDIA_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`))) {
      return type === 'video' ? '' : '/image-placeholder.svg';
    }
  } catch {
    return type === 'video' ? '' : '/image-placeholder.svg';
  }
  const legacyPrefix = String(import.meta.env.VITE_LEGACY_ASSET_PREFIX || '').trim();
  const publicPrefix = String(import.meta.env.VITE_PUBLIC_ASSET_PREFIX || '').trim();
  if (legacyPrefix && publicPrefix && url.startsWith(legacyPrefix)) {
    return `${publicPrefix}${url.slice(legacyPrefix.length)}`;
  }
  return url;
}

export function normalizeApiPayload(payload, mediaType = 'image') {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(item => normalizeApiPayload(item, mediaType));
  const objectMediaType = String(payload.type || '').toLowerCase() === 'video'
    ? 'video'
    : mediaType;
  const out = {};
  for (const [key, v] of Object.entries(payload)) {
    const normalizedKey = String(key).toLowerCase();
    const nextMediaType = normalizedKey === 'video'
      || normalizedKey === 'videos'
      || normalizedKey.includes('video')
      ? 'video'
      : normalizedKey === 'image'
        || normalizedKey === 'images'
        ? 'image'
        : objectMediaType;
    if (String(key).toLowerCase() === 'channel' && typeof v === 'string') {
      out[key] = '生成服务';
      continue;
    }
    if (INTERNAL_RESPONSE_KEYS.has(String(key).toLowerCase())) continue;
    if (typeof v === 'string' && PUBLIC_MEDIA_KEYS.has(key) && /^https?:\/\//i.test(v)) {
      out[key] = normalizeImageLikeUrl(v, nextMediaType);
      continue;
    }
    if (typeof v === 'string' && (key === 'imageUrl' || key === 'resultImageUrl' || key === 'referenceImageUrl')) {
      out[key] = normalizeImageLikeUrl(v, 'image');
      continue;
    }
    if (typeof v === 'string' && key === 'videoUrl') {
      out[key] = normalizeImageLikeUrl(v, 'video');
      continue;
    }
    if (typeof v === 'string') {
      out[key] = sanitizePublicErrorText(v);
      continue;
    }
    if (v && typeof v === 'object') out[key] = normalizeApiPayload(v, nextMediaType);
    else out[key] = v;
  }
  return out;
}

function sanitizeGenerationJob(job) {
  if (!job || typeof job !== 'object') return job;
  const allowedKeys = [
    'id',
    'userId',
    'mode',
    'model',
    'size',
    'quality',
    'generationOptions',
    'prompt',
    'promptZh',
    'negativePrompt',
    'referenceImageUrl',
    'publishToPrompts',
    'status',
    'editStrength',
    'attemptCount',
    'maxAttempts',
    'queuedAt',
    'nextRetryAt',
    'lastError',
    'resultImageUrl',
    'latencyMs',
    'isHeartbeat',
    'heartbeatRunId',
    'heartbeatKind',
    'heartbeatCategory',
    'priority',
    'dedupKey',
    'category',
    'createdAt',
    'updatedAt',
    'startedAt',
    'finishedAt',
  ];
  const safeJob = Object.fromEntries(
    allowedKeys
      .filter(key => Object.prototype.hasOwnProperty.call(job, key))
      .map(key => [key, job[key]]),
  );
  const rawOptions = job.generationOptions && typeof job.generationOptions === 'object'
    ? job.generationOptions
    : {};
  const scalarOptionKeys = [
    'aspectRatio',
    'imageSize',
    'referenceAssetId',
    'storyboardId',
    'storyboardShotId',
    'conversationId',
    'taskId',
  ];
  const generationOptions = {};
  for (const key of scalarOptionKeys) {
    if (rawOptions[key] !== undefined && rawOptions[key] !== null) {
      generationOptions[key] = String(rawOptions[key]).slice(0, 240);
    }
  }
  for (const key of ['referenceAssetIds', 'storyboardShotIds']) {
    if (Array.isArray(rawOptions[key])) {
      generationOptions[key] = [...new Set(
        rawOptions[key].map(value => String(value || '').trim().slice(0, 240)).filter(Boolean),
      )];
    }
  }
  if (rawOptions.forceNew === true) generationOptions.forceNew = true;
  safeJob.generationOptions = generationOptions;
  safeJob.lastError = '';
  return safeJob;
}

async function request(path, options = {}) {
  const userToken = (() => {
    try {
      const raw = localStorage.getItem('pf_token');
      if (!raw) return '';
      try { return JSON.parse(raw) || ''; } catch { return raw; }
    } catch { return ''; }
  })();
  const adminToken = (() => {
    try { return localStorage.getItem('pf_admin_session'); } catch { return null; }
  })();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (userToken) headers.Authorization = `Bearer ${userToken}`;
  if (adminToken) headers['x-admin-session'] = adminToken;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const e = new Error(sanitizePublicErrorText(err.error || `Request failed: ${res.status}`));
    e.status = res.status;
    e.details = err;
    // A protected endpoint may be probed before auth restoration finishes.
    // Do not erase local auth when no token was sent with the failed request.
    const authAttemptPaths = [
      '/auth/login',
      '/auth/register',
      '/auth/google',
      '/auth/forgot-password',
      '/auth/reset-password',
    ];
    const shouldClearAuth = Boolean(userToken)
      && !authAttemptPaths.some((authPath) => path === authPath);
    if (res.status === 401 && shouldClearAuth) {
      window.dispatchEvent(new CustomEvent('pf-auth-invalid'));
    }
    throw e;
  }
  const payload = await res.json();
  return normalizeApiPayload(payload);
}

async function requestFormData(path, body, { timeoutMs = 30000 } = {}) {
  const headers = {};
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const userToken = (() => {
    try {
      const raw = localStorage.getItem('pf_token');
      if (!raw) return '';
      try { return JSON.parse(raw) || ''; } catch { return raw; }
    } catch { return ''; }
  })();
  const adminToken = (() => {
    try { return localStorage.getItem('pf_admin_session'); } catch { return null; }
  })();
  if (userToken) headers.Authorization = `Bearer ${userToken}`;
  if (adminToken) headers['x-admin-session'] = adminToken;

  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      body,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      const error = new Error(sanitizePublicErrorText(err.error || `Request failed: ${res.status}`));
      error.status = res.status;
      error.details = err;
      throw error;
    }
    const payload = await res.json();
    return normalizeApiPayload(payload);
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
      timeoutError.code = 'REQUEST_TIMEOUT';
      timeoutError.path = path;
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function isRealGeneratedPrompt(prompt) {
  if (!prompt || !String(prompt.id || '').startsWith('gen-')) return false;
  const imageUrl = String(prompt.imageUrl || '').trim().toLowerCase();
  if (!imageUrl || imageUrl.startsWith('data:')) return false;
  if (
    imageUrl === '/image-placeholder.svg'
    || imageUrl === '/uploads/test.png'
    || imageUrl.includes('/test-generated/')
    || imageUrl.includes('test.png')
  ) {
    return false;
  }
  return true;
}

export function filterRealGeneratedPrompts(prompts = []) {
  const byId = new Map();
  for (const prompt of prompts) {
    if (isRealGeneratedPrompt(prompt) && !byId.has(prompt.id)) {
      byId.set(prompt.id, prompt);
    }
  }
  return [...byId.values()];
}

async function getRealGeneratedPrompts(params = {}) {
  const filters = { ...params };
  delete filters.limit;
  delete filters.offset;

  const pageSize = 500;
  const prompts = [];
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const qs = new URLSearchParams({
      ...filters,
      limit: String(pageSize),
      offset: String(offset),
    }).toString();
    const data = await request(`/prompts?${qs}`);
    const page = Array.isArray(data?.prompts) ? data.prompts : [];
    prompts.push(...page);

    const nextTotal = Number(data?.total);
    total = Number.isFinite(nextTotal) ? nextTotal : offset + page.length;
    if (page.length === 0 || page.length < pageSize) break;
    offset += page.length;
  }

  const filteredPrompts = filterRealGeneratedPrompts(prompts);
  return {
    prompts: filteredPrompts,
    total: filteredPrompts.length,
  };
}

export const api = {
  // Prompts
  getPrompts: (params = {}) => {
    const qs = new URLSearchParams({ limit: '500', ...params }).toString();
    return request(`/prompts${qs ? `?${qs}` : ''}`);
  },
  getGeneratedPrompts: getRealGeneratedPrompts,
  getPrompt: (id) => request(`/prompts/${id}`),
  createPrompt: (data) => request('/prompts', { method: 'POST', body: JSON.stringify(data) }),
  updatePrompt: (id, data) => request(`/prompts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleLike: (id) => request(`/prompts/${id}/like`, { method: 'POST' }),
  toggleSave: (id) => request(`/prompts/${id}/save`, { method: 'POST' }),
  getPromptPreferences: () => request('/me/prompt-preferences'),
  importPromptPreferences: (data) => request('/me/prompt-preferences/import', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  deletePrompt: (id) => request(`/prompts/${id}`, { method: 'DELETE' }),

  // Prompt refinement (AI polish)
  refinePrompt: (data) => request('/prompt/refine', { method: 'POST', body: JSON.stringify(data) }),
  getAgents: () => request('/agents'),
  getCreativeVideoCapabilities: () => request('/agent/video-capabilities'),
  createAgentVideo: (data) => request('/agent/video', { method: 'POST', body: JSON.stringify(data) }),
  extractAgentVideoTailFrame: (videoUrl) => request('/agent/video-tail-frame', {
    method: 'POST',
    body: JSON.stringify({ videoUrl }),
  }),
  getWorkspaceConversations: () => request('/workspace/conversations'),
  saveWorkspaceConversation: (id, data) => request(`/workspace/conversations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  importWorkspaceConversations: (conversations) => request('/workspace/conversations/import', {
    method: 'POST',
    body: JSON.stringify({ conversations }),
  }),
  deleteWorkspaceConversation: (id) => request(`/workspace/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }),
  getWorkspaceState: () => request('/workspace/state'),
  saveWorkspaceState: (data) => request('/workspace/state', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  runAgentStream: (data, handlers = {}, options = {}) => new Promise(async (resolve, reject) => {
    // pf_token 在 localStorage 里是 JSON.stringify 过的（带引号），需要 parse 回来。
    const userToken = (() => {
      try {
        const raw = localStorage.getItem('pf_token');
        if (!raw) return '';
        try { return JSON.parse(raw) || raw; } catch { return raw; }
      } catch { return ''; }
    })();
    let response;
    try {
      response = await fetch(`${BASE}/agent/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}) },
        body: JSON.stringify(data),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      reject(error);
      return;
    }
    if (!response.ok || !response.body) {
      const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      const e = new Error(sanitizePublicErrorText(err.error || `Request failed: ${response.status}`));
      e.status = response.status;
      reject(e);
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;
    let receivedDone = false;
    let streamError = null;
    const handleChunk = (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        const rawEvent = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        for (const line of rawEvent.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const event = JSON.parse(payload);
            // 模型内部事件永远不应进入用户聊天，即使服务端未来误发了它们。
            if (event.visibility !== 'user' || event.visible === false) {
              continue;
            }
            if (event.type === 'text') {
              handlers.onText?.(event);
            } else if (event.type === 'step') {
              handlers.onStep?.(sanitizeAgentPayload(event));
            } else if (event.type === 'done') {
              finalResult = sanitizeAgentPayload(event.result || null);
              receivedDone = true;
            } else if (event.type === 'error') {
              const error = new Error(sanitizePublicErrorText(event.error || 'Agent run failed'));
              error.status = event.status;
              streamError = error;
            }
          } catch {}
        }
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        handleChunk(decoder.decode(value, { stream: true }));
      }
      handleChunk(decoder.decode());
      if (streamError) {
        reject(streamError);
        return;
      }
      if (!receivedDone) {
        const error = new Error('Agent 流式响应中断，请重试');
        error.status = 502;
        reject(error);
        return;
      }
      resolve(finalResult);
    } catch (error) {
      reject(error);
    }
  }),
  runAgent: async (data) => sanitizeAgentPayload(await request('/agent/run', { method: 'POST', body: JSON.stringify(data) })),
  getAgentVideoTask: (jobId) => request(`/agent/video-tasks/${encodeURIComponent(jobId)}`),

  // Image upload
  uploadImage: (file) => {
    const form = new FormData();
    form.append('image', file);
    return requestFormData('/upload', form);
  },
  uploadAsset: (file) => {
    const form = new FormData();
    form.append('image', file);
    return requestFormData('/upload', form);
  },

  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  currentUser: () => request('/auth/me'),
  googleLogin: (data) => request('/auth/google', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (data) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(data) }),
  resetPassword: (data) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),

  // User profile
  getUser: (id) => request(`/users/${id}`),
  getUserPrompts: (id) => request(`/users/${id}/prompts`),
  saveOnboarding: (data) => request('/users/onboarding', { method: 'POST', body: JSON.stringify(data) }),

  // Skills
  getSkills: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/skills${qs ? `?${qs}` : ''}`);
  },
  getSkill: (idOrSlug) => request(`/skills/${encodeURIComponent(idOrSlug)}`),
  getSkillCategories: () => request('/skills/categories'),
  getSkillStats: () => request('/skills/stats'),
  createSkill: (data) => request('/skills', { method: 'POST', body: JSON.stringify(data) }),
  updateSkill: (id, data) => request(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSkill: (id) => request(`/skills/${id}`, { method: 'DELETE' }),
  toggleSkillLike: (id) => request(`/skills/${id}/like`, { method: 'POST' }),
  installSkill: (id) => request(`/skills/${id}/install`, { method: 'POST' }),
  generateSkill: (data) => request('/skills/generate', { method: 'POST', body: JSON.stringify(data) }),
  skillExportUrl: (id) => `${BASE}/skills/${id}/export`,

  // Stats
  getStats: () => request('/stats'),

  // Gen Jobs
  createGenJob: async (data) => sanitizeGenerationJob(await request('/gen/jobs', { method: 'POST', body: JSON.stringify(data) })),
  getGenJob: async (id) => sanitizeGenerationJob(await request(`/gen/jobs/${id}`)),
  listGenJobs: async (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const payload = await request(`/gen/jobs${qs ? `?${qs}` : ''}`);
    return {
      ...payload,
      jobs: Array.isArray(payload?.jobs) ? payload.jobs.map(sanitizeGenerationJob) : [],
    };
  },
  requeueGenJob: async (id) => sanitizeGenerationJob(await request(`/gen/jobs/${id}/requeue`, { method: 'POST' })),
  cancelGenJob: async (id) => sanitizeGenerationJob(await request(`/gen/jobs/${id}/cancel`, { method: 'POST' })),

  // Admin
  adminStats: () => request('/admin/stats'),
  adminListUsers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/users${qs ? `?${qs}` : ''}`);
  },
  adminGetUser: (id) => request(`/admin/users/${id}`),
  adminUpdateUser: (id, data) => request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adminDeleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
  adminListPrompts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/prompts${qs ? `?${qs}` : ''}`);
  },
  adminDeletePrompt: (id) => request(`/admin/prompts/${id}`, { method: 'DELETE' }),
  adminListJobs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/jobs${qs ? `?${qs}` : ''}`);
  },
  adminHeartbeatStats: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/heartbeat/stats${qs ? `?${qs}` : ''}`);
  },
  adminHeartbeatRuns: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/heartbeat/runs${qs ? `?${qs}` : ''}`);
  },
  adminHeartbeatRun: (data = {}) => request('/admin/heartbeat/run', { method: 'POST', body: JSON.stringify(data) }),
  adminRequeueJob: (id) => request(`/admin/jobs/${id}/requeue`, { method: 'POST' }),
  adminCancelJob: (id) => request(`/admin/jobs/${id}/cancel`, { method: 'POST' }),
  adminListLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/logs${qs ? `?${qs}` : ''}`);
  },

  // Moderation
  adminListModerationChecks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/moderation/checks${qs ? `?${qs}` : ''}`);
  },
  adminApproveModerationCheck: (id) => request(`/admin/moderation/checks/${id}/approve`, { method: 'POST' }),
  adminRejectModerationCheck: (id, reason = '') => request(`/admin/moderation/checks/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }),
  adminDeleteHistory: (id) => request(`/admin/moderation/${id}/delete`, { method: 'POST' }),

  // History
  getHistory: (userId) => {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
    return request(`/history${qs}`);
  },
  addHistory: (data) => request('/history', { method: 'POST', body: JSON.stringify(data) }),
  deleteHistory: (id) => request(`/history/${id}`, { method: 'DELETE' }),

  // Billing
  billingPlans: () => request('/billing/plans'),
  billingCheckout: (planId) => request('/billing/checkout', { method: 'POST', body: JSON.stringify({ planId }) }),
  billingBalance: () => request('/billing/balance'),
  redeemCard: (code) => request('/redeem', { method: 'POST', body: JSON.stringify({ code }) }),
  billingTopUp: (amountCents) => request('/billing/topup', { method: 'POST', body: JSON.stringify({ amount: amountCents }) }),
  billingPortal: () => request('/billing/portal', { method: 'POST' }),
  billingCancel: () => request('/billing/cancel', { method: 'POST' }),

  // Analytics
  trackEvent: ({ eventType, eventName, path, extraData, sessionId, deviceType }) =>
    request('/analytics/event', {
      method: 'POST',
      body: JSON.stringify({ eventType, eventName, path, extraData, sessionId, deviceType }),
    }),
  adminAnalytics: (params = {}, options = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/admin/analytics${qs ? `?${qs}` : ''}`, options);
  },
};
