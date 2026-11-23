import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { api, filterRealGeneratedPrompts, normalizeApiPayload } from '../services/api';

const AppContext = createContext(null);
let commercialPromptsPromise;

function loadCommercialPrompts() {
  if (!commercialPromptsPromise) {
    commercialPromptsPromise = import('../data/commercialPrompts.generated')
      .then(module => Array.isArray(module.COMMERCIAL_PROMPTS) ? module.COMMERCIAL_PROMPTS : []);
  }
  return commercialPromptsPromise;
}

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
function loadToken() {
  try {
    const raw = localStorage.getItem(LS_KEYS.TOKEN);
    if (!raw) return '';
    try { return JSON.parse(raw) || ''; } catch { return raw; }
  } catch {
    return '';
  }
}

function loadCachedUserId() {
  try {
    const user = JSON.parse(localStorage.getItem(LS_KEYS.USER) || 'null');
    return String(user?.id || 'anonymous');
  } catch {
    return 'anonymous';
  }
}

function getUserStorageKey(key, userId) {
  return `${key}:${String(userId || 'anonymous')}`;
}

function loadUserLS(key, userId, fallback) {
  const scopedKey = getUserStorageKey(key, userId);
  try {
    if (localStorage.getItem(scopedKey) !== null) {
      return loadLS(scopedKey, fallback);
    }
    if (String(userId || '') !== 'anonymous' && localStorage.getItem(key) !== null) {
      const legacyValue = loadLS(key, fallback);
      saveLS(scopedKey, legacyValue);
      removeLS(key);
      return legacyValue;
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function saveUserLS(key, userId, value) {
  saveLS(getUserStorageKey(key, userId), value);
}

function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* quota exceeded — silently ignore */ }
}
function removeLS(key) {
  try { localStorage.removeItem(key); } catch {}
}

function dedupePrompts(items = []) {
  const byKey = new Map();
  for (const item of items) {
    if (!item || !item.id) continue;
    const key = `id:${item.id}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}

function filterLegacyCommercialPrompts(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter(prompt => !String(prompt?.id || '').startsWith('commercial-'));
}

function mergePrompts(sourcePrompts, userPrompts, savedIds, likedIds) {
  const savedSet = new Set(savedIds);
  const likedSet = new Set(likedIds);
  const safeUserPrompts = filterLegacyCommercialPrompts(userPrompts);

  const merged = [
    ...safeUserPrompts.map(p => ({ ...p, saved: savedSet.has(p.id), liked: likedSet.has(p.id) })),
    ...sourcePrompts.filter(sp => !safeUserPrompts.find(up => up.id === sp.id))
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
  const location = useLocation();
  // ── Persistent state ──────────────────────────────────────────────────────
  const [prompts, setPrompts] = useState(() => {
    const rawPrompts = loadLS(LS_KEYS.PROMPTS, null);
    const savedPrompts = Array.isArray(rawPrompts) ? normalizeApiPayload(rawPrompts) : [];
    const rawUserPrompts = loadUserLS(LS_KEYS.USER_PROMPTS, loadCachedUserId(), null);
    const userPrompts = filterLegacyCommercialPrompts(normalizeApiPayload(rawUserPrompts));
    const rawSavedIds = loadUserLS(LS_KEYS.SAVED_IDS, loadCachedUserId(), null);
    const savedIds = Array.isArray(rawSavedIds) ? rawSavedIds : [];
    const rawLikedIds = loadUserLS(LS_KEYS.LIKED_IDS, loadCachedUserId(), null);
    const likedIds = Array.isArray(rawLikedIds) ? rawLikedIds : [];
    return mergePrompts(
      filterRealGeneratedPrompts(savedPrompts),
      userPrompts,
      savedIds,
      likedIds,
    );
  });
  const [stats, setStats] = useState(() => {
    const rawStats = loadLS(LS_KEYS.STATS, null);
    if (rawStats && typeof rawStats === 'object') return rawStats;
    return {
      promptsShared: 0,
      imagesGenerated: 0,
      communitySize: 0,
    };
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [savedIds, setSavedIds] = useState(() => new Set(
    loadUserLS(LS_KEYS.SAVED_IDS, loadCachedUserId(), null) || [],
  ));
  const [likedIds, setLikedIds] = useState(() => new Set(
    loadUserLS(LS_KEYS.LIKED_IDS, loadCachedUserId(), null) || [],
  ));
  const [token, setToken] = useState(loadToken);
  const [currentUser, setCurrentUser] = useState(() => (
    token ? normalizeUser(loadLS(LS_KEYS.USER, null)) : null
  ));
  const [authReady, setAuthReady] = useState(() => !token);
  const [generationHistory, setGenerationHistory] = useState(() => (
    normalizeApiPayload(loadUserLS(LS_KEYS.HISTORY, loadCachedUserId(), null)) || []
  ));
  const [generationJobs, setGenerationJobs] = useState([]);
  const [userPrompts, setUserPrompts] = useState(() => (
    filterLegacyCommercialPrompts(normalizeApiPayload(
      loadUserLS(LS_KEYS.USER_PROMPTS, loadCachedUserId(), null),
    ))
  ));
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(() => (
    loadUserLS(LS_KEYS.ONBOARDING_DONE, loadCachedUserId(), false) === true
  ));

  // ── Billing state ─────────────────────────────────────────────────────────
  const [credits, setCredits] = useState(0);
  const [subscription, setSubscription] = useState(null);

  // ── Sync state → localStorage ─────────────────────────────────────────────
  useEffect(() => {
    if (currentUser?.id) saveUserLS(LS_KEYS.SAVED_IDS, currentUser.id, [...savedIds]);
  }, [currentUser?.id, savedIds]);
  useEffect(() => {
    if (currentUser?.id) saveUserLS(LS_KEYS.LIKED_IDS, currentUser.id, [...likedIds]);
  }, [currentUser?.id, likedIds]);
  useEffect(() => {
    if (currentUser) saveLS(LS_KEYS.USER, currentUser);
    else removeLS(LS_KEYS.USER);
  }, [currentUser]);
  useEffect(() => {
    if (token) saveLS(LS_KEYS.TOKEN, token);
    else removeLS(LS_KEYS.TOKEN);
  }, [token]);
  useEffect(() => {
    if (currentUser?.id) saveUserLS(LS_KEYS.HISTORY, currentUser.id, generationHistory);
  }, [currentUser?.id, generationHistory]);
  useEffect(() => {
    if (currentUser?.id) {
      saveUserLS(LS_KEYS.USER_PROMPTS, currentUser.id, filterLegacyCommercialPrompts(userPrompts));
    }
  }, [currentUser?.id, userPrompts]);

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
      .catch(error => {
        if (cancelled) return;
        if (error?.status !== 401) {
          setAuthReady(true);
          return;
        }
        setToken('');
        setCurrentUser(null);
        setGenerationHistory([]);
        setUserPrompts([]);
        setSavedIds(new Set());
        setLikedIds(new Set());
        setHasCompletedOnboarding(false);
        setAuthReady(true);
      });

    return () => { cancelled = true; };
  }, []); // Validate only the token restored during app startup.

  useEffect(() => {
    const clearInvalidAuth = () => {
      setToken('');
      setCurrentUser(null);
      setGenerationHistory([]);
      setUserPrompts([]);
      setSavedIds(new Set());
      setLikedIds(new Set());
      setHasCompletedOnboarding(false);
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

  // ── Load prompts from API ─────────────────────────────────────────────────
  const loadPrompts = useCallback(async (params = {}) => {
    setLoading(true);
    setError(null);
    try {
      const viewerId = String(currentUser?.id || '');
      const [data, statsData, userPromptsData, preferencesData, commercialPrompts] = await Promise.all([
        api.getGeneratedPrompts(params),
        api.getStats(),
        viewerId ? api.getUserPrompts(viewerId) : Promise.resolve({ prompts: [] }),
        viewerId ? api.getPromptPreferences() : Promise.resolve({ likedIds: [], savedIds: [] }),
        loadCommercialPrompts(),
      ]);
      let nextSavedIds = viewerId
        ? new Set(Array.isArray(preferencesData?.savedIds) ? preferencesData.savedIds : [])
        : new Set();
      let nextLikedIds = viewerId
        ? new Set(Array.isArray(preferencesData?.likedIds) ? preferencesData.likedIds : [])
        : new Set();
      const up = viewerId
        ? filterLegacyCommercialPrompts(userPromptsData?.prompts || [])
        : [];
      let preferenceMigrationError = null;
      if (viewerId) {
        const migrationKey = getUserStorageKey('pf_prompt_preferences_migrated', viewerId);
        const alreadyMigrated = loadLS(migrationKey, false) === true;
        const legacySavedIds = loadUserLS(LS_KEYS.SAVED_IDS, viewerId, []);
        const legacyLikedIds = loadUserLS(LS_KEYS.LIKED_IDS, viewerId, []);
        if (!alreadyMigrated && nextSavedIds.size === 0 && nextLikedIds.size === 0
          && (legacySavedIds.length > 0 || legacyLikedIds.length > 0)) {
          try {
            const imported = await api.importPromptPreferences({
              savedIds: legacySavedIds,
              likedIds: legacyLikedIds,
            });
            nextSavedIds = new Set(imported?.savedIds || []);
            nextLikedIds = new Set(imported?.likedIds || []);
            saveLS(migrationKey, true);
          } catch (migrationError) {
            preferenceMigrationError = migrationError;
          }
        } else if (!alreadyMigrated) {
          saveLS(migrationKey, true);
        }
      }
      if (preferenceMigrationError) {
        setError(preferenceMigrationError.message || '收藏和点赞迁移失败');
      }
      setSavedIds(nextSavedIds);
      setLikedIds(nextLikedIds);
      setUserPrompts(up);
      const merged = mergePrompts(
        [...(data.prompts || []), ...commercialPrompts],
        up,
        [...nextSavedIds],
        [...nextLikedIds],
      );

      setPrompts(merged);
      setStats(statsData);
      saveLS(LS_KEYS.PROMPTS, filterRealGeneratedPrompts(data.prompts || []));
      saveLS(LS_KEYS.STATS, statsData);
    } catch (err) {
      setError(err.message);
      const viewerId = String(currentUser?.id || '');
      const up = filterLegacyCommercialPrompts(
        viewerId
          ? loadUserLS(LS_KEYS.USER_PROMPTS, viewerId, [])
          : [],
      );
      const cached = filterRealGeneratedPrompts(loadLS(LS_KEYS.PROMPTS, []));
      const cachedSavedIds = loadUserLS(LS_KEYS.SAVED_IDS, viewerId, []);
      const cachedLikedIds = loadUserLS(LS_KEYS.LIKED_IDS, viewerId, []);
      const commercialPrompts = await loadCommercialPrompts().catch(() => []);
      const merged = mergePrompts(
        [...cached, ...commercialPrompts],
        up,
        Array.isArray(cachedSavedIds) ? cachedSavedIds : [],
        Array.isArray(cachedLikedIds) ? cachedLikedIds : [],
      );
      setPrompts(merged);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  // Only routes that render prompt content need the large public prompt feed.
  const needsPromptFeed = (
    location.pathname === '/'
    || location.pathname.startsWith('/saved')
    || location.pathname.startsWith('/upload')
    || location.pathname.startsWith('/prompt/')
  );

  // Load public data after auth restoration so server-side user preferences are included.
  useEffect(() => {
    if (authReady && needsPromptFeed) loadPrompts();
  }, [authReady, currentUser, loadPrompts, needsPromptFeed]);

  // ── History ────────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const data = await api.getHistory(currentUser.id);
      setGenerationHistory(data.history || []);
      saveUserLS(LS_KEYS.HISTORY, currentUser.id, data.history || []);
    } catch (error) {
      console.error('[history] cloud load failed:', error);
      setGenerationHistory(loadUserLS(LS_KEYS.HISTORY, currentUser.id, []));
      setError(error?.message || '生成历史读取失败');
    }
  }, [currentUser]);

  const needsGenerationHistory = (
    location.pathname.startsWith('/history')
    || location.pathname.startsWith('/workspace')
    || location.pathname.startsWith('/editor')
  );

  useEffect(() => {
    if (authReady && needsGenerationHistory) loadHistory();
  }, [authReady, loadHistory, needsGenerationHistory]);

  // Keep the small queue indicator in sync without polling while idle.
  useEffect(() => {
    if (!authReady) return undefined;

    let cancelled = false;
    let timer = null;
    const previousJobsRef = { current: generationJobs };
    const previousSignatureRef = { current: generationJobs
      .map(job => `${job.id}:${job.status}`)
      .join('|') };

    const syncGenerationJobs = async () => {
      if (!currentUser?.id) {
        if (generationJobs.length > 0) setGenerationJobs([]);
        return;
      }

      try {
        const jobsData = await api.listGenJobs({ limit: 50 });
        const activeJobs = (jobsData.jobs || []).filter(job => (
          job.status === 'queued' || job.status === 'running' || job.status === 'fast_running'
        ));
        const signature = activeJobs.map(job => `${job.id}:${job.status}`).join('|');
        const previousJobs = previousJobsRef.current;
        previousJobsRef.current = activeJobs;
        if (!cancelled) {
          if (signature !== previousSignatureRef.current) {
            previousSignatureRef.current = signature;
            setGenerationJobs(activeJobs);
          }
          if (previousJobs.length > 0 && activeJobs.length === 0) {
            const historyData = await api.getHistory(currentUser.id);
            if (!cancelled) {
              setGenerationHistory(historyData.history || []);
              saveUserLS(LS_KEYS.HISTORY, currentUser.id, historyData.history || []);
            }
          }
        }
      } catch {
        // Keep the last known count when a background refresh is unavailable.
      } finally {
        if (!cancelled && previousJobsRef.current.length > 0) {
          timer = window.setTimeout(syncGenerationJobs, 6000);
        }
      }
    };

    syncGenerationJobs();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [authReady, currentUser?.id, generationJobs]);

  // ── Toggle like ───────────────────────────────────────────────────────────
  const toggleLike = useCallback(async (id) => {
    const wasLiked = likedIds.has(id);
    setLikedIds(prev => { const n = new Set(prev); wasLiked ? n.delete(id) : n.add(id); return n; });
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, liked: !wasLiked, likes: p.likes + (wasLiked ? -1 : 1) } : p));
    setUserPrompts(prev => prev.map(p => p.id === id ? { ...p, liked: !wasLiked, likes: p.likes + (wasLiked ? -1 : 1) } : p));
    try {
      const updated = await api.toggleLike(id);
      if (updated && typeof updated.liked === 'boolean') {
        setLikedIds(prev => {
          const next = new Set(prev);
          updated.liked ? next.add(id) : next.delete(id);
          return next;
        });
        setPrompts(prev => prev.map(p => p.id === id
          ? { ...p, liked: updated.liked, likes: Number(updated.likes ?? p.likes) }
          : p));
      }
    } catch (error) {
      setError(error?.message || '点赞保存失败');
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
    try {
      const updated = await api.toggleSave(id);
      if (updated && typeof updated.saved === 'boolean') {
        setSavedIds(prev => {
          const next = new Set(prev);
          updated.saved ? next.add(id) : next.delete(id);
          return next;
        });
      }
    } catch (error) {
      setError(error?.message || '收藏保存失败');
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
    setUserPrompts([]);
    setSavedIds(new Set());
    setLikedIds(new Set());
    setPrompts(current => current.filter(prompt => !prompt.isUserPrompt));
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
    if (currentUser?.id && newEntry.imageUrl && newEntry.prompt) {
      api.addHistory({
        imageUrl: newEntry.imageUrl,
        prompt: newEntry.prompt,
        model: newEntry.model,
        mode: newEntry.mode,
        jobId: newEntry.jobId || '',
        referenceAssetId: newEntry.referenceAssetId || '',
        storyboardShotId: newEntry.storyboardShotId || '',
        conversationId: newEntry.conversationId || '',
        category: newEntry.category || '',
      }).then(remote => {
        const saved = remote?.history || remote;
        if (!saved?.id) throw new Error('生成历史接口没有返回已保存记录');
        setGenerationHistory(prev => [
          saved,
          ...prev.filter(item => item.id !== newEntry.id && item.id !== saved.id),
        ].slice(0, MAX_HISTORY));
      }).catch(error => {
        setError(error?.message || '生成历史保存失败');
      });
    }
  }, [currentUser?.id]);

  const registerGenerationJob = useCallback((job) => {
    if (!job?.id || !['queued', 'running', 'fast_running'].includes(job.status || 'queued')) return;
    setGenerationJobs(prev => [
      job,
      ...prev.filter(existing => existing.id !== job.id),
    ]);
  }, []);

  const removeFromHistory = useCallback((id) => {
    const removed = generationHistory.find(item => item.id === id);
    setGenerationHistory(prev => prev.filter(h => h.id !== id));
    api.deleteHistory(id).catch(error => {
      setError(error?.message || '生成历史删除失败');
      if (removed) setGenerationHistory(prev => [removed, ...prev.filter(item => item.id !== id)]);
    });
  }, [generationHistory]);

  const clearHistory = useCallback(() => {
    // Optimistically clear local state immediately
    const current = generationHistory;
    setGenerationHistory([]);
    if (currentUser?.id) saveUserLS(LS_KEYS.HISTORY, currentUser.id, []);
    // Delete each item from the backend
    Promise.all(current.map(h => api.deleteHistory(h.id))).catch(error => {
      setError(error?.message || '生成历史清空失败');
      loadHistory();
    });
  }, [currentUser?.id, generationHistory, loadHistory]);

  // ── User prompt management ───────────────────────────────────────────────
  const addUserPrompt = useCallback((promptData) => {
    const newPrompt = {
      ...promptData,
      id: promptData?.id || `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      createdAt: promptData?.createdAt || new Date().toISOString(),
      likes: 0,
      usedCount: 0,
      isUserPrompt: true,
    };
    setUserPrompts(prev => {
      const updated = [newPrompt, ...prev];
      if (currentUser?.id) saveUserLS(LS_KEYS.USER_PROMPTS, currentUser.id, updated);
      return updated;
    });
    setPrompts(prev => [newPrompt, ...prev]);
    setStats(prev => ({ ...prev, promptsShared: prev.promptsShared + 1 }));
    return newPrompt;
  }, [currentUser?.id]);

  const deleteUserPrompt = useCallback((id) => {
    setUserPrompts(prev => {
      const updated = prev.filter(p => p.id !== id);
      if (currentUser?.id) saveUserLS(LS_KEYS.USER_PROMPTS, currentUser.id, updated);
      return updated;
    });
    setPrompts(prev => prev.filter(p => p.id !== id));
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setLikedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setStats(prev => ({ ...prev, promptsShared: Math.max(0, prev.promptsShared - 1) }));
  }, [currentUser?.id]);

  const updateUserPrompt = useCallback((id, updates) => {
    setUserPrompts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      if (currentUser?.id) saveUserLS(LS_KEYS.USER_PROMPTS, currentUser.id, updated);
      return updated;
    });
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, [currentUser?.id]);

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
    } catch (error) {
      console.error('[billing] balance load failed:', error);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!authReady) return;
    if (currentUser) {
      loadBilling();
    } else {
      setCredits(0);
      setSubscription(null);
    }
  }, [authReady, loadBilling, currentUser]);

  const updateLocalPrompt = useCallback((id, updates) => {
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    setUserPrompts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      if (currentUser?.id) saveUserLS(LS_KEYS.USER_PROMPTS, currentUser.id, updated);
      return updated;
    });
  }, [currentUser?.id]);

  const removePrompt = useCallback((id) => {
    setPrompts(prev => prev.filter(p => p.id !== id));
    setUserPrompts(prev => {
      const updated = prev.filter(p => p.id !== id);
      if (currentUser?.id) saveUserLS(LS_KEYS.USER_PROMPTS, currentUser.id, updated);
      return updated;
    });
    setSavedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    setLikedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, [currentUser?.id]);

  // ── Rebuild merged prompts when savedIds/likedIds change ─────────────────
  useEffect(() => {
    setPrompts(prev => prev.map(p => ({
      ...p,
      saved: savedIds.has(p.id),
      liked: likedIds.has(p.id),
    })));
  }, [savedIds, likedIds]);

  // ── Onboarding ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) {
      setHasCompletedOnboarding(false);
      return;
    }
    setHasCompletedOnboarding(
      Boolean(currentUser.hasCompletedOnboarding)
      || loadUserLS(LS_KEYS.ONBOARDING_DONE, currentUser.id, false) === true,
    );
  }, [currentUser]);

  const completeOnboarding = useCallback(async (profileData = {}) => {
    const data = { ...profileData, completedAt: new Date().toISOString() };
    await api.saveOnboarding(data);
    saveUserLS(LS_KEYS.ONBOARDING_DONE, currentUser?.id, true);
    setCurrentUser(current => current
      ? {
        ...current,
        onboardingSource: Array.isArray(data.source) ? data.source : [],
        onboardingRole: data.role || '',
        onboardingUseCase: Array.isArray(data.useCase) ? data.useCase : [],
        onboardingCompletedAt: data.completedAt,
        hasCompletedOnboarding: true,
      }
      : current);
    setHasCompletedOnboarding(true);
  }, [currentUser?.id]);

  const value = {
    // Data
    prompts,
    loading,
    error,
    stats,
    savedIds,
    likedIds,
    generationHistory,
    generationJobs,
    generationQueueCount: generationJobs.length,
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
    registerGenerationJob,
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
