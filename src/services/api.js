const BASE = '/api';

function normalizeImageLikeUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return url;
  const legacyPrefix = String(import.meta.env.VITE_LEGACY_ASSET_PREFIX || '').trim();
  const publicPrefix = String(import.meta.env.VITE_PUBLIC_ASSET_PREFIX || '').trim();
  if (legacyPrefix && publicPrefix && url.startsWith(legacyPrefix)) {
    return `${publicPrefix}${url.slice(legacyPrefix.length)}`;
  }
  return url;
}

function normalizeApiPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (Array.isArray(payload)) return payload.map(normalizeApiPayload);
  const out = { ...payload };
  for (const key of Object.keys(out)) {
    const v = out[key];
    if (typeof v === 'string' && (key === 'imageUrl' || key === 'resultImageUrl' || key === 'referenceImageUrl')) {
      out[key] = normalizeImageLikeUrl(v);
      continue;
    }
    if (v && typeof v === 'object') out[key] = normalizeApiPayload(v);
  }
  return out;
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
    const e = new Error(err.error || `Request failed: ${res.status}`);
    e.status = res.status;
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent('pf-auth-invalid'));
    }
    throw e;
  }
  const payload = await res.json();
  return normalizeApiPayload(payload);
}

async function requestFormData(path, body) {
  const headers = {};
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

  const res = await fetch(`${BASE}${path}`, { method: 'POST', body, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }
  const payload = await res.json();
  return normalizeApiPayload(payload);
}

export const api = {
  // Prompts
  getPrompts: (params = {}) => {
    const qs = new URLSearchParams({ limit: '500', ...params }).toString();
    return request(`/prompts${qs ? `?${qs}` : ''}`);
  },
  getPrompt: (id) => request(`/prompts/${id}`),
  createPrompt: (data) => request('/prompts', { method: 'POST', body: JSON.stringify(data) }),
  updatePrompt: (id, data) => request(`/prompts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  toggleLike: (id) => request(`/prompts/${id}/like`, { method: 'POST' }),
  toggleSave: (id) => request(`/prompts/${id}/save`, { method: 'POST' }),
  deletePrompt: (id) => request(`/prompts/${id}`, { method: 'DELETE' }),

  // Prompt refinement (AI polish)
  refinePrompt: (data) => request('/prompt/refine', { method: 'POST', body: JSON.stringify(data) }),

  // Image upload
  uploadImage: (file) => {
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

  // Stats
  getStats: () => request('/stats'),

  // Gen Jobs
  createGenJob: (data) => request('/gen/jobs', { method: 'POST', body: JSON.stringify(data) }),
  getGenJob: (id) => request(`/gen/jobs/${id}`),
  listGenJobs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/gen/jobs${qs ? `?${qs}` : ''}`);
  },
  requeueGenJob: (id) => request(`/gen/jobs/${id}/requeue`, { method: 'POST' }),
  cancelGenJob: (id) => request(`/gen/jobs/${id}/cancel`, { method: 'POST' }),

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
