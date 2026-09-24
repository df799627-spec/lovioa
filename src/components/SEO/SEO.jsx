/**
 * SEO — head manager for per-page meta, OG, Twitter card, canonical & JSON-LD.
 *
 * Two usage modes:
 *
 * 1. Declarative (recommended for static/declarative pages):
 *    <SEO
 *      title="Cinematic Portrait Prompt"
 *      description="..."
 *      image="/uploads/1.jpg"
 *      url="/prompt/abc"
 *      type="article"
 *      jsonLd={imageObjectJsonLd({ ... })}
 *    />
 *
 * 2. Imperative (for pages that need to update SEO after data loads):
 *    const updateSeo = useSEO();
 *    updateSeo({ title: '...', image: '...', jsonLd: { ... } });
 *
 * Defaults are site-level when props are omitted.
 */

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLocale } from '../../hooks/useLocale';

// ── defaults ────────────────────────────────────────────────────────────────

const SITE_NAME = 'Lovioa';
const SITE_URL  = import.meta.env.VITE_SITE_URL
  || (typeof window !== 'undefined' ? window.location.origin : '');
const SITE_DESC = 'Discover, share, and recreate stunning AI-generated photography prompts. A curated gallery for photographers and AI enthusiasts.';

// ── helpers ─────────────────────────────────────────────────────────────────

function joinTitle(page) {
  return page ? `${page} — ${SITE_NAME}` : SITE_NAME;
}

function resolveImage(src) {
  if (!src) return null;
  if (src.startsWith('http')) return src;
  return src.startsWith('/') ? `${SITE_URL}${src}` : `${SITE_URL}/${src}`;
}

// ── JSON-LD builders ─────────────────────────────────────────────────────────

export function webSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESC,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function imageObjectJsonLd({ prompt, imageUrl, authorName, url }) {
  const keywords = prompt
    ? prompt.split(' ').filter(Boolean).slice(0, 20).join(', ')
    : '';
  return {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    name: prompt?.slice(0, 80) || 'AI Photography Prompt',
    description: prompt || '',
    contentUrl: imageUrl ? resolveImage(imageUrl) : '',
    url: url ? `${SITE_URL}${url}` : SITE_URL,
    ...(authorName ? { author: { '@type': 'Person', name: authorName } } : {}),
    dateCreated: new Date().toISOString(),
    keywords,
    license: 'https://creativecommons.org/licenses/by/4.0/',
  };
}

export function imageGalleryJsonLd({ promptCount = 0, imageCount = 0 }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: 'Lovioa — AI Photography Prompt Gallery',
    description: SITE_DESC,
    url: SITE_URL,
    numberOfItems: promptCount,
  };
}

export function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url ? `${SITE_URL}${item.url}` : SITE_URL,
    })),
  };
}

export function personJsonLd({ username, promptCount, profileUrl }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: username,
    url: profileUrl ? `${SITE_URL}${profileUrl}` : SITE_URL,
    description: `AI photography prompt creator on Lovioa`,
    ...(promptCount ? { memberOf: [{ '@type': 'CreativeWork', name: 'Lovioa', url: SITE_URL }] } : {}),
  };
}

// ── tag helper ─────────────────────────────────────────────────────────────

function upsertTag(head, selector, tagName, attrs) {
  let el = selector ? head.querySelector(selector) : null;
  if (!el) {
    el = document.createElement(tagName);
    if (selector) el.id = selector.replace('#', '');
    head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => {
    if (v == null) return;
    el.setAttribute(k, v);
  });
  return el;
}

// ── global SEO state (updated imperatively via useSEO()) ───────────────────

const _seo = {};

export function updateSEO(config) {
  Object.assign(_seo, config);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('__seo:update'));
  }
}

// ── component ────────────────────────────────────────────────────────────────

export default function SEO({
  title: propTitle,
  description: propDesc,
  image: propImage,
  url: propUrl,
  type = 'website',
  jsonLd: propJsonLd,
  noindex = false,
  author,
  section,
  publishedAt,
  modifiedAt,
}) {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const location = useLocation();
  // Use state to trigger re-render on seo:update events
  const [seoVersion, setSeoVersion] = useState(0);

  const handleSeoUpdate = useCallback(() => setSeoVersion(v => v + 1), []);

  useEffect(() => {
    window.addEventListener('__seo:update', handleSeoUpdate);
    return () => window.removeEventListener('__seo:update', handleSeoUpdate);
  }, [handleSeoUpdate]);

  const metaTitle    = propTitle || _seo.title || '';
  const metaDesc     = propDesc  || _seo.description || t('meta.description') || SITE_DESC;
  const metaImage    = resolveImage(propImage || _seo.image);
  const resolvedUrl  = propUrl   || location.pathname;
  const canonicalUrl = `${SITE_URL}${resolvedUrl}`;
  const resolvedLang = locale || 'en';
  const robots       = noindex ? 'noindex, follow' : 'index, follow';
  const resolvedJsonLd = propJsonLd || _seo.jsonLd;

  useEffect(() => {
    const head = document.head;

    // — document title
    document.title = metaTitle ? joinTitle(metaTitle) : SITE_NAME;

    // — lang
    document.documentElement.lang = resolvedLang;

    // — basic meta
    upsertTag(head, 'meta[name="description"]', 'meta', { name: 'description', content: metaDesc });
    upsertTag(head, 'meta[name="author"]',       'meta', { name: 'author',       content: author || SITE_NAME });
    upsertTag(head, 'meta[name="robots"]',       'meta', { name: 'robots',       content: robots });

    // — canonical
    upsertTag(head, 'link[rel="canonical"]', 'link', { rel: 'canonical', href: canonicalUrl });

    // — Open Graph
    upsertTag(head, 'meta[property="og:title"]',        'meta', { property: 'og:title',       content: joinTitle(metaTitle) });
    upsertTag(head, 'meta[property="og:description"]',   'meta', { property: 'og:description', content: metaDesc });
    upsertTag(head, 'meta[property="og:image"]',         'meta', { property: 'og:image',       content: metaImage || '' });
    upsertTag(head, 'meta[property="og:url"]',           'meta', { property: 'og:url',         content: canonicalUrl });
    upsertTag(head, 'meta[property="og:type"]',          'meta', { property: 'og:type',        content: type });
    upsertTag(head, 'meta[property="og:site_name"]',      'meta', { property: 'og:site_name',  content: SITE_NAME });
    upsertTag(head, 'meta[property="og:locale"]',        'meta', { property: 'og:locale',      content: resolvedLang });

    // — Twitter Card
    upsertTag(head, 'meta[name="twitter:card"]',         'meta', { name: 'twitter:card',         content: 'summary_large_image' });
    upsertTag(head, 'meta[name="twitter:title"]',        'meta', { name: 'twitter:title',        content: joinTitle(metaTitle) });
    upsertTag(head, 'meta[name="twitter:description"]',   'meta', { name: 'twitter:description',  content: metaDesc });
    upsertTag(head, 'meta[name="twitter:image"]',         'meta', { name: 'twitter:image',        content: metaImage || '' });
    upsertTag(head, 'meta[name="twitter:site"]',          'meta', { name: 'twitter:site',         content: '@lovioa' });

    // — article meta
    if (type === 'article') {
      upsertTag(head, 'meta[property="article:author"]',          'meta', { property: 'article:author',           content: author || SITE_NAME });
      upsertTag(head, 'meta[property="article:published_time"]',  'meta', { property: 'article:published_time',   content: publishedAt || new Date().toISOString() });
      if (modifiedAt) upsertTag(head, 'meta[property="article:modified_time"]', 'meta', { property: 'article:modified_time', content: modifiedAt });
      if (section) upsertTag(head, 'meta[property="article:section"]', 'meta', { property: 'article:section', content: section });
    }

    // — og:image dimensions (required for Google rich results)
    if (metaImage) {
      upsertTag(head, 'meta[property="og:image:width"]',   'meta', { property: 'og:image:width',   content: '1200' });
      upsertTag(head, 'meta[property="og:image:height"]',  'meta', { property: 'og:image:height',  content: '630' });
      upsertTag(head, 'meta[property="og:image:alt"]',      'meta', { property: 'og:image:alt',     content: metaTitle });
    }

    // — Twitter Card extras
    upsertTag(head, 'meta[name="twitter:creator"]',    'meta', { name: 'twitter:creator',    content: '@lovioa' });
    upsertTag(head, 'meta[name="twitter:image:alt"]',  'meta', { name: 'twitter:image:alt',  content: metaTitle });

    // — JSON-LD
    if (resolvedJsonLd) {
      upsertTag(head, 'script[type="application/ld+json"]', 'script', { type: 'application/ld+json' });
      const ldEl = head.querySelector('script[type="application/ld+json"]');
      if (ldEl) ldEl.textContent = JSON.stringify(resolvedJsonLd);
    }
  }, [metaTitle, metaDesc, metaImage, canonicalUrl, type, robots, resolvedLang, resolvedJsonLd, author, section, publishedAt, modifiedAt, seoVersion]);

  return null;
}
