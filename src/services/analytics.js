/**
 * Lightweight analytics tracking service.
 * Tracks page views and user actions by sending events to /api/analytics/event.
 *
 * Usage:
 *   import { trackPage, trackAction } from './analytics';
 *   trackPage('/explore', { category: 'Portrait' });
 *   trackAction('act_generate_start', { model: 'gpt-image-2' });
 */

import { api } from '../services/api';

// Generate or retrieve a persistent session ID
export function getSessionId() {
  let id = sessionStorage.getItem('_analytics_sid');
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem('_analytics_sid', id);
  }
  return id;
}

// Detect device type from user agent
export function getDeviceType() {
  if (typeof window === 'undefined') return 'desktop';
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile';
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';
  return 'desktop';
}

// exported getSessionId and getDeviceType are the public API

export function trackPage(path, extra = {}) {
  if (!path) return;
  // Debounce: don't track the same path twice within 3s
  const key = `_pv_${path}`;
  const now = Date.now();
  const last = parseInt(sessionStorage.getItem(key) || '0', 10);
  if (now - last < 3000) return;
  sessionStorage.setItem(key, now);

  api.trackEvent({
    eventType: 'page_view',
    eventName: pageEventName(path),
    path,
    extraData: { ...extra, referrer: document.referrer || '' },
    sessionId: getSessionId(),
    deviceType: getDeviceType(),
  }).catch(() => {}); // fire and forget
}

// Track a user action
export function trackAction(eventName, extra = {}) {
  if (!eventName) return;
  api.trackEvent({
    eventType: 'action',
    eventName,
    path: window.location.pathname,
    extraData: extra,
    sessionId: getSessionId(),
    deviceType: getDeviceType(),
  }).catch(() => {}); // fire and forget
}

// Map path to a clean event name for page views
function pageEventName(path) {
  if (!path) return 'unknown';
  if (path === '/') return 'page_home';
  if (path.startsWith('/prompt/')) return 'page_prompt_detail';
  if (path === '/explore' || path === '/') return 'page_explore';
  if (path === '/saved') return 'page_saved';
  if (path === '/history') return 'page_history';
  if (path === '/profile/') return 'page_profile';
  if (path === '/upload') return 'page_upload';
  if (path === '/auth') return 'page_auth';
  if (path === '/subscribe') return 'page_subscribe';
  if (path === '/balance') return 'page_balance';
  if (path.startsWith('/legal')) return 'page_legal';
  if (path === '/team') return 'page_team';
  if (path === '/acceptable-use') return 'page_acceptable_use';
  if (path === '/editor') return 'page_editor';
  if (path === '/onboarding') return 'page_onboarding';
  if (path === '/admin') return 'page_admin';
  return `page_${path.replace(/\//g, '_').replace(/^_|_$/g, '')}`;
}

// Auto-track on route changes — call this once in App.jsx
export function initPageTracking() {
  if (typeof window === 'undefined') return;

  // Track initial page
  trackPage(window.location.pathname);

  // Listen for SPA route changes
  let lastPath = window.location.pathname;
  const observer = new MutationObserver(() => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      // Small delay to let React render
      setTimeout(() => trackPage(currentPath), 150);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Also listen for popstate (browser back/forward)
  window.addEventListener('popstate', () => {
    const currentPath = window.location.pathname;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      setTimeout(() => trackPage(currentPath), 150);
    }
  });
}