import { useTranslation } from 'react-i18next';
import './Team.css';

export default function Team() {
  const { t } = useTranslation();

  return (
    <main className="team-page">
      <div className="container">
        <div className="team-page__card">
          <p className="team-page__eyebrow">Lovioa</p>
          <h1 className="team-page__title">{t('team.title', 'Team')}</h1>
          <p className="team-page__desc">
            {t(
              'team.desc',
              'We are building the most practical AI prompt and image workflow for creators. If you need enterprise support, contact us at hello@lovioa.com.',
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
