import { errors } from './errors.js';

const DEFAULT_LANG = 'en';

/**
 * Detect language from an Express request's Accept-Language header.
 * Supports: en, zh
 */
export function detectLang(req) {
  const header = req?.headers?.['accept-language'] || '';
  // e.g. "en-US,en;q=0.9,zh-CN;q=0.8"
  if (/zh/i.test(header)) return 'zh';
  return DEFAULT_LANG;
}

/**
 * Get a translated string by key.
 * @param {string} key - i18n key
 * @param {string} lang - language code
 * @param {object} params - interpolation params
 */
export function t(key, lang = DEFAULT_LANG, params = {}) {
  const langErrors = errors[lang] || errors[DEFAULT_LANG];
  let msg = langErrors[key] ?? key;
  // Simple {{param}} interpolation
  if (params) {
    msg = msg.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      params[k] !== undefined ? String(params[k]) : `{{${k}}}`
    );
  }
  return msg;
}

/**
 * Create an { error: "..." } response using the request's preferred language.
 * @param {object} req - Express request
 * @param {string} key - i18n error key
 * @param {object} params - interpolation params
 */
export function err(req, key, params = {}) {
  const lang = detectLang(req);
  return { error: t(key, lang, params) };
}

/**
 * Format HTTP error response with i18n.
 */
export function errStatus(req, key, params = {}, status = 400) {
  return { status, body: err(req, key, params) };
}