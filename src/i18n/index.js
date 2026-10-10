import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { detectLocaleByIP } from '../services/ipLocale';
import { syncDocumentDirection } from '../hooks/useLocale';
import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import ar from './locales/ar.json';
import ru from './locales/ru.json';
import hi from './locales/hi.json';

/**
 * Initialize i18next with the following detection order:
 * 1. URL querystring  (e.g. ?lang=zh)
 * 2. User-preferred language stored in localStorage (pf_lang)
 * 3. IP-based detection (most accurate for first-time visitors)
 * 4. Browser navigator language fallback
 */
const detectionOptions = {
  order: ['querystring', 'localStorage', 'navigator'],
  caches: ['localStorage'],
  lookupQuerystring: 'lang',
  lookupLocalStorage: 'pf_lang',
  // Lower priority — i18next will check querystring and localStorage first.
  // We pass a function that returns the IP-detected language only when
  // the higher-priority lookups don't yield a supported language.
  lookupFromPathIndex: 0,
};

/**
 * Async initialization. Call once at app entry before rendering.
 * Returns the resolved language.
 */
export async function initI18n() {
  // Always register the plugins first
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: en }, zh: { translation: zh },
        ja: { translation: ja }, ko: { translation: ko },
        fr: { translation: fr }, de: { translation: de },
        es: { translation: es }, pt: { translation: pt },
        ar: { translation: ar }, ru: { translation: ru },
        hi: { translation: hi },
      },
      fallbackLng: 'en',
      supportedLngs: ['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ar', 'ru', 'hi'],
      interpolation: { escapeValue: false },
      detection: detectionOptions,
    });

  // If neither querystring nor localStorage gave a supported language,
  // run the IP-based detection to fill the gap.
  const detected = await detectLocaleByIP();
  const storedLang = localStorage.getItem('pf_lang');

  if (
    detected.source === 'ip' &&
    (!storedLang || !['en', 'zh', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ar', 'ru', 'hi'].includes(storedLang)) &&
    !new URLSearchParams(window.location.search).has('lang')
  ) {
    // No manual preference set — apply the IP-detected language.
    // Also persist it so refreshes don't re-trigger the IP lookup.
    await i18n.changeLanguage(detected.lang);
    localStorage.setItem('pf_lang', detected.lang);
    syncDocumentDirection(detected.lang);
  }

  // Ensure <html dir> is set correctly for the resolved language
  syncDocumentDirection(i18n.language);

  return { lang: i18n.language, source: detected.source, country: detected.country };
}

export default i18n;
