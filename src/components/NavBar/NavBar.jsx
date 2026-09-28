import { Link } from 'react-router-dom';
import { Menu, X, Upload, Bookmark, History, ListTodo, LogOut, User, Globe, Shield, CreditCard, Coins, Wand2, Palette } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { syncDocumentDirection } from '../../hooks/useLocale';
import './NavBar.css';

/* eslint-disable react-refresh/only-export-components */
export const LANG_LABELS = {
  en: { native: 'English',        short: 'EN' },
  zh: { native: '中文',           short: '中文' },
  ja: { native: '日本語',         short: 'JA' },
  ko: { native: '한국어',          short: 'KO' },
  fr: { native: 'Français',       short: 'FR' },
  de: { native: 'Deutsch',        short: 'DE' },
  es: { native: 'Español',        short: 'ES' },
  pt: { native: 'Português',      short: 'PT' },
  ar: { native: 'العربية',         short: 'AR' },
  ru: { native: 'Русский',        short: 'RU' },
  hi: { native: 'हिन्दी',          short: 'HI' },
};
/* eslint-enable react-refresh/only-export-components */

export default function NavBar() {
  const { t, i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const { savedIds, generationHistory, generationQueueCount, currentUser, logout, credits } = useApp();
  const { theme, setTheme } = useTheme();
  const userMenuRef = useRef(null);
  const langMenuRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handleClick = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false);
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) setLangMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const switchLang = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('pf_lang', lang);
    syncDocumentDirection(lang);
    setLangMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    setUserMenuOpen(false);
  };

  return (
    <>
      <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
        <div className="navbar__inner container">
          <Link to="/" className="navbar__logo">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="2" width="10" height="10" rx="2" fill="var(--color-accent)"/>
              <rect x="16" y="2" width="10" height="10" rx="2" fill="var(--color-accent)" opacity="0.5"/>
              <rect x="2" y="16" width="10" height="10" rx="2" fill="var(--color-accent)" opacity="0.5"/>
              <rect x="16" y="16" width="10" height="10" rx="2" fill="var(--color-accent)"/>
            </svg>
            <span className="navbar__brand">{t('brand')}</span>
          </Link>

          <div className="navbar__links">
            <Link to="/" className="navbar__link">{t('nav.explore')}</Link>
            <Link to="/subscribe" className="navbar__link">
              <CreditCard size={13} />
              {t('nav.subscribe')}
            </Link>
            <Link to="/redeem" className="navbar__link">
              <CreditCard size={13} />
              {t('nav.redeem')}
            </Link>
            <Link to="/terms" className="navbar__legal-link">{t('legal.nav.terms')}</Link>
            <Link to="/privacy" className="navbar__legal-link">{t('legal.nav.privacy')}</Link>
            <Link to="/saved" className={`navbar__link ${savedIds.size > 0 ? 'navbar__link--badge' : ''}`}>
              <Bookmark size={13} />
              {t('nav.saved')} {savedIds.size > 0 && <span className="navbar__badge">{savedIds.size}</span>}
            </Link>
            <Link to="/history" className={`navbar__link ${generationHistory.length > 0 ? 'navbar__link--badge' : ''}`}>
              <History size={13} />
              {t('nav.history')} {generationHistory.length > 0 && <span className="navbar__badge">{generationHistory.length}</span>}
            </Link>
            <Link
              to="/history"
              className={`navbar__queue-link ${generationQueueCount > 0 ? 'navbar__queue-link--active' : ''}`}
              aria-label={t('hero.queueBtn')}
              title={t('hero.queueBtn')}
            >
              <ListTodo size={16} />
              {generationQueueCount > 0 && <span className="navbar__queue-badge">{generationQueueCount > 99 ? '99+' : generationQueueCount}</span>}
            </Link>
            <Link to="/editor" className="navbar__link">
              <Wand2 size={13} />
              {t('nav.editor')}
            </Link>

            <div className="navbar__lang-wrap" ref={langMenuRef}>
              <button className="navbar__lang-btn" onClick={() => setLangMenuOpen(o => !o)}>
                <Globe size={13} />
                <span>{LANG_LABELS[i18n.language]?.short ?? 'EN'}</span>
              </button>
              {langMenuOpen && (
                <div className="navbar__lang-menu navbar__lang-menu--multi">
                  {Object.entries(LANG_LABELS).map(([lang, label]) => (
                    <button
                      key={lang}
                      className={`navbar__lang-option ${i18n.language === lang ? 'active' : ''}`}
                      onClick={() => switchLang(lang)}
                    >
                      <span className="navbar__lang-native">{label.native}</span>
                      <span className="navbar__lang-short">{label.short}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              className="navbar__theme-btn"
              type="button"
              onClick={() => setTheme(theme === 'studio' ? 'editorial' : 'studio')}
              aria-label={t('settings.theme')}
              aria-pressed={theme === 'studio'}
              title={`${t('settings.theme')}: ${theme === 'studio' ? t('settings.themeStudio') : t('settings.themeEditorial')}`}
            >
              <Palette size={14} />
              <span>{theme === 'studio' ? t('settings.themeStudio') : t('settings.themeEditorial')}</span>
            </button>

            {currentUser ? (
              <div className="navbar__user-wrap" ref={userMenuRef}>
                <button className="navbar__user-btn" onClick={() => setUserMenuOpen(o => !o)}>
                  <img src={currentUser.avatar} alt={currentUser.username} className="navbar__user-avatar" />
                  <span className="navbar__user-name">{currentUser.username}</span>
                </button>
                {userMenuOpen && (
                  <div className="navbar__user-menu">
                    <div className="navbar__user-menu-info">
                      <Link to={`/profile/${currentUser.id}`} className="navbar__user-menu-info-link" onClick={() => setUserMenuOpen(false)}>
                        <img src={currentUser.avatar} alt="" className="navbar__user-menu-avatar" />
                        <div>
                          <div className="navbar__user-menu-name">{currentUser.username}</div>
                          <div className="navbar__user-menu-email">{currentUser.email}</div>
                        </div>
                      </Link>
                    </div>
                    <div className="navbar__user-menu-divider" />
                    <Link to={`/profile/${currentUser.id}`} className="navbar__user-menu-item" onClick={() => setUserMenuOpen(false)}>
                      <User size={14} /> {t('nav.myProfile')}
                    </Link>
                    <Link to="/subscribe" className="navbar__user-menu-item" onClick={() => setUserMenuOpen(false)}>
                      <CreditCard size={14} /> {t('nav.subscribe')}
                    </Link>
                    <Link to="/redeem" className="navbar__user-menu-item" onClick={() => setUserMenuOpen(false)}>
                      <CreditCard size={14} /> {t('nav.redeem')}
                    </Link>
                    <Link to="/balance" className="navbar__user-menu-item" onClick={() => setUserMenuOpen(false)}>
                      <Coins size={14} />
                      {t('nav.credits')}
                      {credits > 0 && <span className="navbar__credits-badge">{Math.floor(credits)}</span>}
                    </Link>
                    {currentUser.isAdmin && (
                      <>
                        <div className="navbar__user-menu-divider" />
                        <Link to="/admin" className="navbar__user-menu-item" onClick={() => setUserMenuOpen(false)}>
                          <Shield size={14} /> {t('nav.admin')}
                        </Link>
                      </>
                    )}
                    <div className="navbar__user-menu-divider" />
                    <button className="navbar__user-menu-item" onClick={handleLogout}>
                      <LogOut size={14} /> {t('nav.signOut')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link to="/auth" className="navbar__auth-link">
                <User size={14} /> {t('nav.signIn')}
              </Link>
            )}

            <Link to="/upload" className="navbar__cta">
              <Upload size={14} />
              {t('nav.upload')}
            </Link>

          </div>

          <button className="navbar__hamburger" onClick={() => setMobileOpen(true)} aria-label={t('nav.openMenu')}>
            <Menu size={22} />
          </button>
        </div>
      </nav>

      <div className={`mobile-drawer ${mobileOpen ? 'mobile-drawer--open' : ''}`} onClick={() => setMobileOpen(false)}>
        <div className="mobile-drawer__content" onClick={e => e.stopPropagation()}>
          <button className="mobile-drawer__close" onClick={() => setMobileOpen(false)} aria-label={t('nav.closeMenu')}>
            <X size={22} />
          </button>
          <Link to="/" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>{t('nav.explore')}</Link>
          <Link to="/subscribe" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>
            <CreditCard size={16} /> {t('nav.subscribe')}
          </Link>
          <Link to="/redeem" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>
            <CreditCard size={16} /> {t('nav.redeem')}
          </Link>
          <Link to="/terms" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>
            {t('legal.nav.terms')}
          </Link>
          <Link to="/privacy" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>
            {t('legal.nav.privacy')}
          </Link>
          <Link to="/saved" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>
            <Bookmark size={16} /> {t('nav.saved')} {savedIds.size > 0 && <span className="mobile-drawer__badge">{savedIds.size}</span>}
          </Link>
          <Link to="/history" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>
            <History size={16} /> {t('nav.history')} {generationHistory.length > 0 && <span className="mobile-drawer__badge">{generationHistory.length}</span>}
          </Link>
          <Link to="/history" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>
            <ListTodo size={16} /> {t('hero.queueBtn')} {generationQueueCount > 0 && <span className="mobile-drawer__badge">{generationQueueCount}</span>}
          </Link>
          <Link to="/editor" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>
            <Wand2 size={16} /> {t('nav.editor')}
          </Link>
          <div className="mobile-drawer__lang-row">
            <Globe size={16} />
            {Object.entries(LANG_LABELS).map(([lang, label]) => (
              <button
                key={lang}
                className={`mobile-drawer__lang-btn ${i18n.language === lang ? 'active' : ''}`}
                onClick={() => { switchLang(lang); setMobileOpen(false); }}
              >
                {label.short}
              </button>
            ))}
          </div>
          <div className="mobile-drawer__theme-row">
            <Palette size={16} />
            <span className="mobile-drawer__theme-label">{t('settings.theme')}</span>
            <button
              type="button"
              className={`mobile-drawer__theme-btn ${theme === 'editorial' ? 'active' : ''}`}
              onClick={() => setTheme('editorial')}
              aria-pressed={theme === 'editorial'}
            >
              {t('settings.themeEditorial')}
            </button>
            <button
              type="button"
              className={`mobile-drawer__theme-btn ${theme === 'studio' ? 'active' : ''}`}
              onClick={() => setTheme('studio')}
              aria-pressed={theme === 'studio'}
            >
              {t('settings.themeStudio')}
            </button>
          </div>
          {currentUser ? (
            <>
              <div className="mobile-drawer__user">
                <img src={currentUser.avatar} alt="" className="mobile-drawer__user-avatar" />
                <span>{currentUser.username}</span>
              </div>
              <button className="mobile-drawer__link mobile-drawer__link--danger" onClick={() => { handleLogout(); setMobileOpen(false); }}>
                <LogOut size={16} /> {t('nav.signOut')}
              </button>
            </>
          ) : (
            <Link to="/auth" className="mobile-drawer__link" onClick={() => setMobileOpen(false)}>
              <User size={16} /> {t('nav.signIn')}
            </Link>
          )}
          <Link to="/upload" className="mobile-drawer__cta" onClick={() => setMobileOpen(false)}>
            <Upload size={16} /> {t('nav.upload')}
          </Link>
        </div>
      </div>
    </>
  );
}
