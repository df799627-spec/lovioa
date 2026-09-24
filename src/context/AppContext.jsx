import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { PROMPTS as LEGACY_SEED_PROMPTS } from '../data/prompts';
import { COMMERCIAL_PROMPTS } from '../data/commercialPrompts.generated';

const SEED_PROMPTS = [...LEGACY_SEED_PROMPTS, ...COMMERCIAL_PROMPTS];

const AppContext = createContext(null);

const LS_KEYS = {
  PROMPTS: 'pf_prompts',
  STATS: 'pf_stats',
  SAVED_IDS: 'pf_saved_ids',
  LIKED_IDS: 'pf_liked_ids',
  USER: 'pf_user',
  TOKEN: 'pf_token',
  HISTORY: 'pf_gen_history',
  LANG: 'pf_lang',
  USER_PROMPTS: 'pf_user_prompts',
  API_KEY: 'pf_api_key',
  ONBOARDING_DONE: 'pf_onboarding_done',
};
const MAX_HISTORY = 50;

// ── Helpers ──────────────────────────────────────────────────────────────────
function loadLS(key, fallback) {
  try { const val = JSON.parse(localStorage.getItem(key)); return val == null ? fallback : val; }
  catch { return fallback; }
}
function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* quota exceeded — silently ignore */ }
}
function removeLS(key) {
  try { localStorage.removeItem(key); } catch {}
}

// ── Seed prompt deduplication ────────────────────────────────────────────────
function dedupePrompts(items = []) {
  const byKey = new Map();
  for (const item of items) {
    if (!item || !item.id) continue;
    const key = `id:${item.id}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}

function mergePrompts(seedPrompts, userPrompts, savedIds, likedIds) {
  const savedSet = new Set(savedIds);
  const likedSet = new Set(likedIds);

  const merged = [
    ...userPrompts.map(p => ({ ...p, saved: savedSet.has(p.id), liked: likedSet.has(p.id) })),
    ...seedPrompts.filter(sp => !userPrompts.find(up => up.id === sp.id))
      .map(p => ({ ...p, saved: savedSet.has(p.id), liked: likedSet.has(p.id) })),
  ];
  return dedupePrompts(merged);
}

function normalizeCreditsValue(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (!raw || typeof raw !== 'object') return 0;
  // Support nested { balance: { totalCredits, freeCredits, paidCredits, ... } }
  if (raw.balance && typeof raw.balance === 'object') {
    const b = raw.balance;
    if (typeof b.totalCredits === 'number' && Number.isFinite(b.totalCredits)) return b.totalCredits;
    if (typeof b.balance === 'number' && Number.isFinite(b.balance)) return b.balance;
    const free = Number(b.freeCredits ?? b.free_credits ?? 0);
    const paid = Number(b.paidCredits ?? b.paid_credits ?? 0);
    if (Number.isFinite(free) && Number.isFinite(paid)) return free + paid;
    return 0;
  }
  // Flat shapes
  if (typeof raw.totalCredits === 'number' && Number.isFinite(raw.totalCredits)) return raw.totalCredits;
  if (typeof raw.balance === 'number' && Number.isFinite(raw.balance)) return raw.balance;
  const free = Number(raw.freeCredits ?? raw.free_credits ?? 0);
  const paid = Number(raw.paidCredits ?? raw.paid_credits ?? 0);
  if (Number.isFinite(free) && Number.isFinite(paid)) return free + paid;
  return 0;
}

function normalizeUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    ...raw,
    isAdmin: !!(raw.isAdmin ?? raw.is_admin),
  };
}

export function AppProvider({ children }) {
  // ── Persistent state ──────────────────────────────────────────────────────
  const [prompts, setPrompts] = useState(() => {
    const rawPrompts = loadLS(LS_KEYS.PROMPTS, null);
    const savedPrompts = Array.isArray(rawPrompts) ? rawPrompts : [];
    const rawUserPrompts = loadLS(LS_KEYS.USER_PROMPTS, null);
    const userPrompts = Array.isArray(rawUserPrompts) ? rawUserPrompts : [];
    const rawSavedIds = loadLS(LS_KEYS.SAVED_IDS, null);
    const savedIds = Array.isArray(rawSavedIds) ? rawSavedIds : [];
    const rawLikedIds = loadLS(LS_KEYS.LIKED_IDS, null);
    const likedIds = Array.isArray(rawLikedIds) ? rawLikedIds : [];
    if (savedPrompts.length > 0) {
      return mergePrompts([...savedPrompts, ...COMMERCIAL_PROMPTS], userPrompts, savedIds, likedIds);
    }
    return mergePrompts(SEED_PROMPTS, userPrompts, savedIds, likedIds);
  });
  const [stats, setStats] = useState(() => {
    const rawStats = loadLS(LS_KEYS.STATS, null);
    if (rawStats && typeof rawStats === 'object') return rawStats;
    return {
      promptsShared: Array.isArray(SEED_PROMPTS) ? SEED_PROMPTS.length : 0,
      imagesGenerated: 0,
      communitySize: 0,
    };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [savedIds, setSavedIds] = useState(() => new Set(loadLS(LS_KEYS.SAVED_IDS, null) || []));
  const [likedIds, setLikedIds] = useState(() => new Set(loadLS(LS_KEYS.LIKED_IDS, null) || []));
  const [token, setToken] = useState(() => loadLS(LS_KEYS.TOKEN, '') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [authReady, setAuthReady] = useState(() => !token);
  const [generationHistory, setGenerationHistory] = useState(() => loadLS(LS_KEYS.HISTORY, null) || []);
  const [userPrompts, setUserPrompts] = useState(() => loadLS(LS_KEYS.USER_PROMPTS, null) || []);

  // ── Billing state ─────────────────────────────────────────────────────────
  const [credits, setCredits] = useState(0);
  const [subscription, setSubscription] = useState(null);

  // ── Sync state → localStorage ─────────────────────────────────────────────
  useEffect(() => { saveLS(LS_KEYS.SAVED_IDS, [...savedIds]); }, [savedIds]);
  useEffect(() => { saveLS(LS_KEYS.LIKED_IDS, [...likedIds]); }, [likedIds]);
  useEffect(() => {
    if (currentUser) saveLS(LS_KEYS.USER, currentUser);
    else removeLS(LS_KEYS.USER);
  }, [currentUser]);
  useEffect(() => {
    if (token) saveLS(LS_KEYS.TOKEN, token);
    else removeLS(LS_KEYS.TOKEN);
  }, [token]);
  useEffect(() => { saveLS(LS_KEYS.HISTORY, generationHistory); }, [generationHistory]);
  useEffect(() => { saveLS(LS_KEYS.USER_PROMPTS, userPrompts); }, [userPrompts]);

  // A cached user is only a display hint. Validate the persisted token once
  // before treating the session as authenticated.
  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setAuthReady(true);
      return () => { cancelled = true; };
    }

    api.currentUser()
      .then(data => {
        if (cancelled) return;
        const user = normalizeUser(data?.user);
        if (!user) throw new Error('Missing authenticated user');
        setCurrentUser(user);
        setAuthReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setToken('');
        setCurrentUser(null);
        setGenerationHistory([]);
        removeLS(LS_KEYS.HISTORY);
        setAuthReady(true);
      });

    return () => { cancelled = true; };
  }, []); // Validate only the token restored during app startup.

  useEffect(() => {
    const clearInvalidAuth = () => {
      setToken('');
      setCurrentUser(null);
      setGenerationHistory([]);
      removeLS(LS_KEYS.HISTORY);
      setAuthReady(true);
    };
    window.addEventListener('pf-auth-invalid', clearInvalidAuth);
    return () => window.removeEventListener('pf-auth-invalid', clearInvalidAuth);
  }, []);

  // ── API key helpers ────────────────────────────────────────────────────────
  const savedApiKey = loadLS(LS_KEYS.API_KEY, '') || '';

  const saveApiKey = useCallback((key) => {
    saveLS(LS_KEYS.API_KEY, key);
  }, []);

  // ── Load prompts from API (with local fallback) ────────────────────────────
  const loadPrompts = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const [data, statsData] = await Promise.all([api.getPrompts(params), api.getStats()]);

      const up = loadLS(LS_KEYS.USER_PROMPTS, []);
      const merged = mergePrompts(
        [...(data.prompts || []), ...COMMERCIAL_PROMPTS],
        up,
        [...savedIds],
        [...likedIds],
      );

      setPrompts(merged);
      setStats(statsData);
      saveLS(LS_KEYS.PROMPTS, dedupePrompts([...(data.prompts || []), ...COMMERCIAL_PROMPTS]));
      saveLS(LS_KEYS.STATS, statsData);
    } catch (err) {
      // Network failure — keep using cached prompts
      setError(err.message);
      const up = loadLS(LS_KEYS.USER_PROMPTS, []);
      const cached = dedupePrompts(loadLS(LS_KEYS.PROMPTS, SEED_PROMPTS));
      const merged = mergePrompts(cached, up, [...savedIds], [...likedIds]);
      setPrompts(merged);
    } finally {
      setLoading(false);
    }
  }, [savedIds, likedIds]);

  // Initial load
  useEffect(() => { loadPrompts(); }, []);

  // ── History ────────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const data = await api.getHistory(currentUser.id);
      setGenerationHistory(data.history || []);
    } catch {}
  }, [currentUser]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── Toggle like ───────────────────────────────────────────────────────────
  const toggleLike = useCallback(async (id) => {
    const wasLiked = likedIds.has(id);
    setLikedIds(prev => { const n = new Set(prev); wasLiked ? n.delete(id) : n.add(id); return n; });
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, liked: !wasLiked, likes: p.likes + (wasLiked ? -1 : 1) } : p));
    setUserPrompts(prev => prev.map(p => p.id === id ? { ...p, liked: !wasLiked, likes: p.likes + (wasLiked ? -1 : 1) } : p));
    try { await api.toggleLike(id); } catch {
      setLikedIds(prev => { const n = new Set(prev); wasLiked ? n.add(id) : n.delete(id); return n; });
      setPrompts(prev => prev.map(p => p.id === id ? { ...p, liked: wasLiked, likes: p.likes + (wasLiked ? 1 : -1) } : p));
      setUserPrompts(prev => prev.map(p => p.id === id ? { ...p, liked: wasLiked, likes: p.likes + (wasLiked ? 1 : -1) } : p));
    }
  }, [likedIds]);

  // ── Toggle save ───────────────────────────────────────────────────────────
  const toggleSave = useCallback(async (id) => {
    const wasSaved = savedIds.has(id);
    setSavedIds(prev => { const n = new Set(prev); wasSaved ? n.delete(id) : n.add(id); return n; });
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, saved: !wasSaved } : p));
    setUserPrompts(prev => prev.map(p => p.id === id ? { ...p, saved: !wasSaved } : p));
    try { await api.toggleSave(id); } catch {
      setSavedIds(prev => { const n = new Set(prev); wasSaved ? n.add(id) : n.delete(id); return n; });
      setPrompts(prev => prev.map(p => p.id === id ? { ...p, saved: wasSaved } : p));
      setUserPrompts(prev => prev.map(p => p.id === id ? { ...p, saved: wasSaved } : p));
    }
  }, [savedIds]);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const data = await api.login({ email, password });
    const user = normalizeUser(data.user);
    saveLS(LS_KEYS.TOKEN, data.token);
    saveLS(LS_KEYS.USER, user);
    setToken(data.token);
    setCurrentUser(user);
    setAuthReady(true);
    return data;
  }, []);

  const register = useCallback(async (username, email, password) => {
    const data = await api.register({ username, email, password });
    const user = normalizeUser(data.user);
    saveLS(LS_KEYS.TOKEN, data.token);
    saveLS(LS_KEYS.USER, user);
    setToken(data.token);
    setCurrentUser(user);
    setAuthReady(true);
    return data;
  }, []);

  const googleLogin = useCallback(async (idToken) => {
    const data = await api.googleLogin({ idToken });
    const user = normalizeUser(data.user);
    saveLS(LS_KEYS.TOKEN, data.token);
    saveLS(LS_KEYS.USER, user);
    setToken(data.token);
    setCurrentUser(user);
    setAuthReady(true);
    return data;
  }, []);

  const forgotPassword = useCallback(async (email) => {
    return api.forgotPassword({ email });
  }, []);

  const resetPassword = useCallback(async (tokenValue, password) => {
    return api.resetPassword({ token: tokenValue, password });
  }, []);

  const logout = useCallback(() => {
    setToken('');
    setCurrentUser(null);
    setGenerationHistory([]);
    removeLS(LS_KEYS.HISTORY);
  }, []);

  // ── History ───────────────────────────────────────────────────────────────
  const addToHistory = useCallback((entry) => {
    const newEntry = {
      ...entry,
      id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
    setGenerationHistory(prev => {
      const next = [newEntry, ...prev].filter(h => h.id !== newEntry.id).slice(0, MAX_HISTORY);
      return next;
    });
  }, []);

  const removeFromHistory = useCallback((id) => {
    setGenerationHistory(prev => prev.filter(h => h.id !== id));
    api.deleteHistory(id).catch(() => {});
  }, []);

  const clearHistory = useCallback(() => {
    // Optimistically clear local state immediately
    const current = generationHistory;
    setGenerationHistory([]);
    removeLS(LS_KEYS.HISTORY);
    // Delete each item from the backend
    Promise.allSettled(current.map(h => api.deleteHistory(h.id))).catch(() => {});
  }, [generationHistory]);

  // ── User prompt management ───────────────────────────────────────────────
  const addUserPrompt = useCallback((promptData) => {
    const newPrompt = {
      ...promptData,
      id: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      likes: 0,
      usedCount: 0,
      isUserPrompt: true,
    };
    setUserPrompts(prev => {
      const updated = [newPrompt, ...prev];
      saveLS(LS_KEYS.USER_PROMPTS, updated);
      return updated;
    });
    setPrompts(prev => [newPrompt, ...prev]);
    setStats(prev => ({ ...prev, promptsShared: prev.promptsShared + 1 }));
    return newPrompt;
  }, []);

  const deleteUserPrompt = useCallback((id) => {
    setUserPrompts(prev => {
      const updated = prev.filter(p => p.id !== id);
      saveLS(LS_KEYS.USER_PROMPTS, updated);
      return updated;
    });
    setPrompts(prev => prev.filter(p => p.id !== id));
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setLikedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setStats(prev => ({ ...prev, promptsShared: Math.max(0, prev.promptsShared - 1) }));
  }, []);

  const updateUserPrompt = useCallback((id, updates) => {
    setUserPrompts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      saveLS(LS_KEYS.USER_PROMPTS, updated);
      return updated;
    });
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  // ── Increment used count ─────────────────────────────────────────────────
  const incrementUsedCount = useCallback((id) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, usedCount: (p.usedCount || 0) + 1 } : p));
    setUserPrompts(prev => prev.map(p => p.id === id ? { ...p, usedCount: (p.usedCount || 0) + 1 } : p));
    setStats(prev => ({ ...prev, imagesGenerated: prev.imagesGenerated + 1 }));
  }, []);

  const refreshPrompts = useCallback(() => loadPrompts(), [loadPrompts]);

  // ── Billing ───────────────────────────────────────────────────────────────
  const loadBilling = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const data = await api.billingBalance();
      setCredits(normalizeCreditsValue(data?.balance ?? data));
      setSubscription(data.subscription ?? null);
    } catch {}
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadBilling();
    } else {
      setCredits(0);
      setSubscription(null);
    }
  }, [loadBilling, currentUser]);

  const updateLocalPrompt = useCallback((id, updates) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    setUserPrompts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      saveLS(LS_KEYS.USER_PROMPTS, updated);
      return updated;
    });
  }, []);

  const removePrompt = useCallback((id) => {
    setPrompts(prev => prev.filter(p => p.id !== id));
    setUserPrompts(prev => {
      const updated = prev.filter(p => p.id !== id);
      saveLS(LS_KEYS.USER_PROMPTS, updated);
      return updated;
    });
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setLikedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, []);

  // ── Rebuild merged prompts when savedIds/likedIds change ─────────────────
  useEffect(() => {
    setPrompts(prev => prev.map(p => ({
      ...p,
      saved: savedIds.has(p.id),
      liked: likedIds.has(p.id),
    })));
  }, [savedIds, likedIds]);

  // ── Onboarding ─────────────────────────────────────────────────────────────
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => {
    return loadLS(LS_KEYS.ONBOARDING_DONE, false);
  });

  const completeOnboarding = useCallback(async (profileData = {}) => {
    const data = { ...profileData, completedAt: new Date().toISOString() };
    saveLS(LS_KEYS.ONBOARDING_DONE, true);
    setHasCompletedOnboarding(true);
    try {
      await api.saveOnboarding(data);
    } catch {
      // graceful degradation — still marked done locally
    }
  }, []);

  const value = {
    // Data
    prompts,
    loading,
    error,
    stats,
    savedIds,
    likedIds,
    generationHistory,
    userPrompts,

    // Auth
    currentUser,
    token,
    authReady,
    login,
    register,
    googleLogin,
    forgotPassword,
    resetPassword,
    logout,

    // Onboarding
    hasCompletedOnboarding,
    completeOnboarding,

    // API key
    savedApiKey,
    saveApiKey,

    // Actions
    toggleLike,
    toggleSave,
    addToHistory,
    removeFromHistory,
    clearHistory,
    addUserPrompt,
    deleteUserPrompt,
    updateUserPrompt,
    incrementUsedCount,
    loadPrompts,
    refreshPrompts,
    updateLocalPrompt,
    removePrompt,

    // Billing
    credits,
    subscription,
    loadBilling,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};
