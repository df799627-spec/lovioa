/**
 * IP-based locale detection service.
 * Uses a public IP geolocation endpoint to infer the user's language
 * from their country, then caches the result in localStorage.
 *
 * Supported: en, zh, ja, ko, fr, de, es, pt, ar, ru, hi
 */

export const SUPPORTED_LANGS = ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ar', 'ru', 'hi'];

/**
 * Country codes → language codes.
 * Order matters: more specific regions should come first if overlapping.
 * @type {Array<[string | string[], string]>}  [countrySet, lang]
 */
const COUNTRY_TO_LANG = [
  [['CN', 'TW', 'HK', 'MO'], 'zh'],  // Chinese-speaking regions
  [['SG', 'MY'], 'zh'],              // Singapore and Malaysia
  [['JP'], 'ja'],                    // Japan
  [['KR', 'KP'], 'ko'],              // Korea
  [['FR', 'BE', 'CA', 'CH', 'MC', 'LU'], 'fr'],  // French-speaking
  [['DE', 'AT', 'LI', 'CH'], 'de'],  // German-speaking
  [['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'EC', 'VE', 'UY', 'PY', 'BO', 'GT', 'DO', 'CU', 'PA', 'HN', 'NI', 'SV', 'CR', 'PR'], 'es'],  // Spanish-speaking
  [['BR', 'PT'], 'pt'],              // Portuguese (Brazil + Portugal)
  [['SA', 'AE', 'EG', 'IQ', 'KW', 'QA', 'BH', 'OM', 'JO', 'LB', 'SY', 'YE', 'SD', 'LY', 'TN', 'DZ', 'MA', 'MR', 'DJ', 'SO', 'PS'], 'ar'],  // Arabic-speaking
  [['RU', 'KZ', 'BY', 'KG', 'TJ', 'TM', 'UZ'], 'ru'],  // Russian-speaking
  [['IN', 'PK', 'BD', 'NP', 'LK', 'MV'], 'hi'],        // Hindi-Urdu (India subcontinent)
];

const STORAGE_KEY = 'pf_ip_lang';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

/**
 * @returns {{ lang: string, source: 'ip'|'cache'|'manual'|'default', country: string|null }}
 */
export async function detectLocaleByIP() {
  // 1. Check localStorage cache first
  try {
    const cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return { lang: cached.lang, source: 'cache', country: cached.country || null };
    }
  } catch { /* ignore */ }

  // 2. If user has manually set a language preference, skip IP lookup
  const manualLang = localStorage.getItem('pf_lang');
  if (manualLang && SUPPORTED_LANGS.includes(manualLang)) {
    return { lang: manualLang, source: 'manual', country: null };
  }

  // 3. Fetch country from IP
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch('https://ip-api.com/json/?fields=status,countryCode,country', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === 'success') {
      const countryCode = data.countryCode;
      const lang = resolveLangFromCountry(countryCode);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang, country: countryCode, ts: Date.now() }));
      } catch { /* localStorage full */ }

      return { lang, source: 'ip', country: countryCode };
    }
  } catch { /* network/timeout failure */ }

  // 4. Default fallback
  return { lang: 'en', source: 'default', country: null };
}

/**
 * Map a country code to a supported language.
 * @param {string} countryCode
 * @returns {string}
 */
function resolveLangFromCountry(countryCode) {
  for (const [countries, lang] of COUNTRY_TO_LANG) {
    if (countries.includes(countryCode)) return lang;
  }
  return 'en';
}
