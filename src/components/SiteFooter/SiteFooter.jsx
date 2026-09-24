import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './SiteFooter.css';

const SUPPORT_EMAIL = 'support@lovioa.com';

export default function SiteFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner container">
        <div className="site-footer__brand-row">
          <Link to="/" className="site-footer__brand">{t('brand')}</Link>
          <p className="site-footer__tagline">{t('footer.tagline')}</p>
        </div>

        <div className="site-footer__links">
          <div className="site-footer__col">
            <div className="site-footer__col-title">{t('footer.links.pricing')}</div>
            <Link to="/subscribe" className="site-footer__link">{t('nav.subscribe')}</Link>
          </div>

          <div className="site-footer__col">
            <div className="site-footer__col-title">{t('footer.links.contact')}</div>
            <a className="site-footer__link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </div>

          <div className="site-footer__col">
            <div className="site-footer__col-title">{t('legal.title')}</div>
            <Link to="/terms" className="site-footer__link">{t('legal.nav.terms')}</Link>
            <Link to="/privacy" className="site-footer__link">{t('legal.nav.privacy')}</Link>
            <Link to="/cookies" className="site-footer__link">{t('legal.nav.cookies')}</Link>
            <Link to="/acceptable-use" className="site-footer__link">{t('legal.nav.acceptableUse')}</Link>
          </div>
        </div>

        <div className="site-footer__bottom">
          <span>{t('footer.copyright', { year })}</span>
          <span>{t('footer.madeWith')}</span>
        </div>
      </div>
    </footer>
  );
}

