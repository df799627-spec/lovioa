import { useTranslation } from 'react-i18next';
import './AcceptableUse.css';

const SUPPORT_EMAIL = 'support@lovioa.com';

export default function AcceptableUse() {
  const { t } = useTranslation();

  return (
    <div className="aup">
      <div className="container aup__inner">
        <p className="aup__eyebrow">{t('legal.nav.acceptableUse')}</p>
        <h1 className="aup__title">{t('acceptableUse.title')}</h1>
        <p className="aup__subtitle">{t('acceptableUse.subtitle')}</p>

        <div className="aup__card">
          <h2>{t('acceptableUse.prohibitedTitle')}</h2>
          <ul>
            <li>{t('acceptableUse.ruleNsfw')}</li>
            <li>{t('acceptableUse.ruleExploitative')}</li>
            <li>{t('acceptableUse.ruleIllegal')}</li>
            <li>{t('acceptableUse.ruleDeepfake')}</li>
            <li>{t('acceptableUse.ruleEvasion')}</li>
          </ul>

          <h2>{t('acceptableUse.enforcementTitle')}</h2>
          <p>{t('acceptableUse.enforcementBody')}</p>

          <h2>{t('acceptableUse.contactTitle')}</h2>
          <p>
            {t('acceptableUse.contactBodyPrefix')}
            {' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

