/**
 * useLocale — hook for reactive locale state and locale-aware image paths.
 *
 * Usage:
 *   const { locale, t, isZh, isEn, image, setLocale } = useLocale();
 *
 * The `image()` helper returns locale-specific asset paths:
 *   image('hero/bg')  →  /assets/hero/bg.zh.png  or  /assets/hero/bg.png
 */

import { useTranslation } from 'react-i18next';
import { useCallback } from 'react';
import i18n from '../i18n/index.js';

// Base assets directory (relative to public/).
// Adjust if your images live elsewhere.
const ASSET_BASE = '/assets';

/**
   * Map of locale → sub-path suffix for locale-specific assets.
   * @type {Record<string, string>}
   */
export const LOCALE_SUFFIX = {
  en: '', zh: '.zh', ja: '.ja', ko: '.ko',
  fr: '.fr', de: '.de', es: '.es', pt: '.pt',
  ru: '.ru', hi: '.hi', ar: '.ar',
};

/**
 * RTL languages that need `dir="rtl"` on <html>.
 * @type {Set<string>}
 */
const RTL_LANGS = new Set(['ar']);

/**
 * Set the document direction attribute for RTL languages.
 * @param {string} lang
 */
export function syncDocumentDirection(lang) {
  if (typeof document !== 'undefined') {
    document.documentElement.dir = RTL_LANGS.has(lang) ? 'rtl' : 'ltr';
  }
}

/**
 * Resolve a locale-keyed image path.
 *
 * Given a logical name like 'hero/background', it will return:
 *   /assets/hero/background.zh.png  (for zh locale)
 *   /assets/hero/background.png      (English fallback)
 *
 * @param {string} logicalName  - relative path without locale suffix or extension
 * @param {string} [ext='png']  - file extension
 * @returns {string} the best-matching asset URL
 */
export function resolveLocaleImage(logicalName, ext = 'png') {
  if (!logicalName) return '';
  return `${ASSET_BASE}/${logicalName}${LOCALE_SUFFIX[i18n.language] ?? ''}.${ext}`;
}

// ── hook ────────────────────────────────────────────────────────────────────

export function useLocale() {
  const locale = i18n.language;

  const isZh = locale === 'zh';
  const isEn = locale === 'en';
  const isRtl = RTL_LANGS.has(locale);

  /**
   * Programmatically switch locale and persist the preference so future
   * page loads skip the IP detection round-trip.
   */
  const setLocale = useCallback((lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('pf_lang', lang);
    syncDocumentDirection(lang);
  }, []);

  /**
   * Resolve a logical image name to a locale-specific URL.
   * @example image('hero/background')  →  '/assets/hero/background.zh.png'
   */
  const image = useCallback((logicalName, ext = 'png') => {
    return resolveLocaleImage(logicalName, ext);
  }, [locale]);

  return { locale, isZh, isEn, isRtl, setLocale, image };
}