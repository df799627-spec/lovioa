import { useState, useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { Calendar, ImageIcon, Heart } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import PromptCard from '../../components/PromptCard/PromptCard';
import SEO, { personJsonLd } from '../../components/SEO/SEO';
import './Profile.css';

export default function Profile() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { currentUser } = useApp();
  const [user, setUser] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isOwnProfile = currentUser?.id === id;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    Promise.all([api.getUser(id), api.getUserPrompts(id)])
      .then(([userData, promptsData]) => {
        setUser(userData);
        setPrompts(promptsData.prompts);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) return <Navigate to="/" replace />;

  if (loading) {
    return (
      <div className="profile-page">
        <div className="container">
          <div className="profile-page__loading">
            <div className="profile-skeleton__header" />
            <div className="profile-skeleton__grid">
              {[1, 2, 3].map(i => <div key={i} className="profile-skeleton__card" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="profile-page">
        <div className="container">
          <div className="profile-page__error">
            <h2>{t('profile.errorTitle')}</h2>
            <p>{error || t('profile.notFound')}</p>
            <Link to="/" className="profile-page__back-link">{t('profile.backHome')}</Link>
          </div>
        </div>
      </div>
    );
  }

  const totalLikes = prompts.reduce((sum, p) => sum + p.likes, 0);
  const joinedDate = new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <>
      <SEO
        title={`${user.username} — AI Photography Prompts`}
        description={`${user.username} has shared ${prompts.length} AI photography prompts on Lovioa. Explore their creative work and recreate stunning images.`}
        url={`/profile/${id}`}
        type="profile"
        author={user.username}
        jsonLd={personJsonLd({
          username: user.username,
          promptCount: prompts.length,
          profileUrl: `/profile/${id}`,
        })}
      />
      <div className="profile-page">
      <div className="container">
        <motion.div
          className="profile-page__header"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="profile-page__avatar-wrap">
            <img src={user.avatar} alt={user.username} className="profile-page__avatar" />
          </div>
          <div className="profile-page__info">
            <h1 className="profile-page__username">{user.username}</h1>
            <p className="profile-page__email">{user.email}</p>
            <div className="profile-page__meta">
              <span className="profile-page__meta-item">
                <Calendar size={14} />
                {t('profile.joined', { date: joinedDate })}
              </span>
            </div>
          </div>
          {isOwnProfile && (
            <Link to="/upload" className="profile-page__upload-btn">
              {t('profile.sharePrompt')}
            </Link>
          )}
        </motion.div>

        <motion.div
          className="profile-page__stats"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <div className="profile-stat">
            <span className="profile-stat__value">{prompts.length}</span>
            <span className="profile-stat__label">{t('profile.promptsLabel')}</span>
          </div>
          <div className="profile-stat-divider" />
          <div className="profile-stat">
            <span className="profile-stat__value">{totalLikes.toLocaleString()}</span>
            <span className="profile-stat__label">{t('profile.likesLabel')}</span>
          </div>
        </motion.div>

        <div className="profile-page__section">
          <h2 className="profile-page__section-title">
            <ImageIcon size={18} />
            {t('profile.promptsTitle')}
          </h2>
          {prompts.length > 0 ? (
            <div className="profile-page__grid">
              {prompts.map((prompt, i) => (
                <PromptCard key={prompt.id} prompt={prompt} index={i} />
              ))}
            </div>
          ) : (
            <div className="profile-page__empty">
              <p>{t('profile.noPrompts')}</p>
              {isOwnProfile && (
                <Link to="/upload" className="profile-page__empty-cta">{t('profile.shareFirst')}</Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
