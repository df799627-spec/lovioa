import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FileText, Shield, Cookie } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './Legal.css';

const SECTIONS = ['terms', 'privacy', 'cookies'];

/* ── Section content factory (plain objects — easy to i18n key) ─────── */

function TermsContent() {
  const { t } = useTranslation();
  return (
    <div className="legal__content">
      <p className="legal__intro">{t('legal.terms.intro')}</p>

      <h3 className="legal__h3">{t('legal.terms.acceptance.title')}</h3>
      <p>{t('legal.terms.acceptance.body')}</p>

      <h3 className="legal__h3">{t('legal.terms.services.title')}</h3>
      <p>{t('legal.terms.services.body')}</p>

      <h3 className="legal__h3">{t('legal.terms.accounts.title')}</h3>
      <p>{t('legal.terms.accounts.body')}</p>

      <h3 className="legal__h3">{t('legal.terms.content.title')}</h3>
      <p>{t('legal.terms.content.body')}</p>

      <h3 className="legal__h3">{t('legal.terms.prohibited.title')}</h3>
      <p>{t('legal.terms.prohibited.body')}</p>

      <h3 className="legal__h3">{t('acceptableUse.title')}</h3>
      <p>{t('acceptableUse.subtitle')}</p>
      <ul className="legal__list">
        <li>{t('acceptableUse.ruleNsfw')}</li>
        <li>{t('acceptableUse.ruleExploitative')}</li>
        <li>{t('acceptableUse.ruleIllegal')}</li>
        <li>{t('acceptableUse.ruleDeepfake')}</li>
        <li>{t('acceptableUse.ruleEvasion')}</li>
      </ul>

      <h3 className="legal__h3">{t('legal.terms.intellectual.title')}</h3>
      <p>{t('legal.terms.intellectual.body')}</p>

      <h3 className="legal__h3">{t('legal.terms.disclaimer.title')}</h3>
      <p>{t('legal.terms.disclaimer.body')}</p>

      <h3 className="legal__h3">{t('legal.terms.limitation.title')}</h3>
      <p>{t('legal.terms.limitation.body')}</p>

      <h3 className="legal__h3">{t('legal.terms.governing.title')}</h3>
      <p>{t('legal.terms.governing.body')}</p>

      <h3 className="legal__h3">{t('legal.terms.contact.title')}</h3>
      <p>{t('legal.terms.contact.body')}</p>
    </div>
  );
}

function PrivacyContent() {
  const { t } = useTranslation();
  return (
    <div className="legal__content">
      <p className="legal__intro">{t('legal.privacy.intro')}</p>

      <h3 className="legal__h3">{t('legal.privacy.collection.title')}</h3>
      <p>{t('legal.privacy.collection.body')}</p>

      <h3 className="legal__h3">{t('legal.privacy.usage.title')}</h3>
      <p>{t('legal.privacy.usage.body')}</p>

      <h3 className="legal__h3">{t('legal.privacy.sharing.title')}</h3>
      <p>{t('legal.privacy.sharing.body')}</p>

      <h3 className="legal__h3">{t('legal.privacy.security.title')}</h3>
      <p>{t('legal.privacy.security.body')}</p>

      <h3 className="legal__h3">{t('legal.privacy.rights.title')}</h3>
      <p>{t('legal.privacy.rights.body')}</p>

      <h3 className="legal__h3">{t('legal.privacy.retention.title')}</h3>
      <p>{t('legal.privacy.retention.body')}</p>

      <h3 className="legal__h3">{t('legal.privacy.children.title')}</h3>
      <p>{t('legal.privacy.children.body')}</p>

      <h3 className="legal__h3">{t('legal.privacy.changes.title')}</h3>
      <p>{t('legal.privacy.changes.body')}</p>

      <h3 className="legal__h3">{t('legal.privacy.contact.title')}</h3>
      <p>{t('legal.privacy.contact.body')}</p>
    </div>
  );
}

function CookiesContent() {
  const { t } = useTranslation();
  return (
    <div className="legal__content">
      <p className="legal__intro">{t('legal.cookies.intro')}</p>

      <h3 className="legal__h3">{t('legal.cookies.what.title')}</h3>
      <p>{t('legal.cookies.what.body')}</p>

      <h3 className="legal__h3">{t('legal.cookies.types.title')}</h3>
      <p>{t('legal.cookies.types.body')}</p>

      <h3 className="legal__h3">{t('legal.cookies.how.title')}</h3>
      <p>{t('legal.cookies.how.body')}</p>

      <h3 className="legal__h3">{t('legal.cookies.third.title')}</h3>
      <p>{t('legal.cookies.third.body')}</p>

      <h3 className="legal__h3">{t('legal.cookies.manage.title')}</h3>
      <p>{t('legal.cookies.manage.body')}</p>

      <h3 className="legal__h3">{t('legal.cookies.changes.title')}</h3>
      <p>{t('legal.cookies.changes.body')}</p>
    </div>
  );
}

const CONTENT_MAP = {
  terms: { component: TermsContent, labelKey: 'legal.nav.terms', icon: FileText },
  privacy: { component: PrivacyContent, labelKey: 'legal.nav.privacy', icon: Shield },
  cookies: { component: CookiesContent, labelKey: 'legal.nav.cookies', icon: Cookie },
};

/* ── Page component ──────────────────────────────────────────────────── */

export default function Legal() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const getSectionFromLocation = () => {
    const hash = window.location.hash.replace('#', '');
    if (SECTIONS.includes(hash)) return hash;
    const path = window.location.pathname.replace(/^\/+/, '').toLowerCase();
    if (SECTIONS.includes(path)) return path;
    return 'terms';
  };
  const [activeSection, setActiveSection] = useState(() => {
    return getSectionFromLocation();
  });
  useEffect(() => {
    setActiveSection(getSectionFromLocation());
  }, [location.pathname, location.hash]);

  const ActiveContent = CONTENT_MAP[activeSection].component;

  const lastUpdated = t('legal.lastUpdated', { date: 'May 21, 2026' });

  return (
    <div className="legal">
      <div className="container">
        {/* Page header */}
        <div className="legal__header">
          <p className="legal__eyebrow">{t('legal.eyebrow')}</p>
          <h1 className="legal__title">{t('legal.title')}</h1>
          <p className="legal__last-updated">{lastUpdated}</p>
        </div>

        {/* Body: anchor nav + content */}
        <div className="legal__body">
          {/* Sticky anchor nav (desktop sidebar) */}
          <nav className="legal__nav" aria-label={t('legal.navAria')}>
            {SECTIONS.map(key => {
              const { labelKey, icon: Icon } = CONTENT_MAP[key];
              return (
                <button
                  key={key}
                  className={`legal__nav-item ${activeSection === key ? 'is-active' : ''}`}
                  onClick={() => setActiveSection(key)}
                >
                  <Icon size={13} />
                  {t(labelKey)}
                </button>
              );
            })}
          </nav>

          {/* Scrollable content */}
          <div className="legal__main">
            {/* Mobile tab strip */}
            <div className="legal__mobile-tabs">
              {SECTIONS.map(key => {
                const { labelKey, icon: Icon } = CONTENT_MAP[key];
                return (
                  <button
                    key={key}
                    className={`legal__mobile-tab ${activeSection === key ? 'is-active' : ''}`}
                    onClick={() => setActiveSection(key)}
                  >
                    <Icon size={12} />
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>

            <ActiveContent />

            {/* Footer nav */}
            <div className="legal__footer-nav">
              {SECTIONS.map(key => {
                if (key === activeSection) return null;
                const { labelKey } = CONTENT_MAP[key];
                return (
                  <button
                    key={key}
                    className="legal__footer-nav-link"
                    onClick={() => setActiveSection(key)}
                  >
                    {t(labelKey)} &rarr;
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
