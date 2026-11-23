import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Sparkles, Plus, Download, Bot, Lock, FileEdit, Heart } from 'lucide-react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import './Skills.css';

const CATEGORIES = ['general', 'image', 'video', 'writing', 'coding', 'productivity', 'design', 'data', 'marketing', 'education'];

function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n ?? 0);
}

export default function Skills() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser } = useApp();
  const [skills, setSkills] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (debounced) params.search = debounced;
      if (category) params.category = category;
      if (currentUser) params.author = currentUser.id;
      const [listRes, statsRes] = await Promise.all([
        api.getSkills(params),
        api.getSkillStats(),
      ]);
      setSkills(listRes.skills || []);
      setTotal(listRes.total || 0);
      setStats(statsRes);
    } catch (e) {
      console.error('[skills] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [debounced, category, currentUser]);

  useEffect(() => { load(); }, [load]);

  const handleLike = async (e, skill) => {
    e.stopPropagation();
    try {
      const res = await api.toggleSkillLike(skill.id);
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, liked: res.liked, likes: res.likes } : s));
    } catch (e2) {
      if (e2.status === 401) navigate('/auth');
    }
  };

  const handleInstall = async (e, skill) => {
    e.stopPropagation();
    window.open(api.skillExportUrl(skill.id), '_blank');
    try { await api.installSkill(skill.id); } catch { /* counter is best-effort */ }
  };

  const handleUseInWorkspace = (e, skill) => {
    e.stopPropagation();
    navigate(`/workspace?skill=${encodeURIComponent(skill.slug || skill.id)}`);
  };

  return (
    <div className="skills">
      <section className="skills__hero">
        <p className="skills__hero-label">{t('skills.hero.label')}</p>
        <h1 className="skills__hero-title">{t('skills.hero.title')}</h1>
        <p className="skills__hero-subtitle">{t('skills.hero.subtitle')}</p>
        {stats && (
          <div className="skills__hero-stats">
            <span>{t('skills.stats.skills', { count: formatCount(stats.skillsShared) })}</span>
            <span className="skills__hero-stats-sep">·</span>
            <span>{t('skills.stats.installs', { count: formatCount(stats.installs) })}</span>
            <span className="skills__hero-stats-sep">·</span>
            <span>{t('skills.stats.authors', { count: formatCount(stats.authors) })}</span>
          </div>
        )}
        <button className="skills__create-btn" onClick={() => navigate('/skills/create')}>
          <Plus size={15} />
          {t('skills.filters.create')}
        </button>
      </section>

      <main className="skills__main container">
        <div className="skills__toolbar">
          <div className="skills__search">
            <Search size={15} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('skills.filters.searchPlaceholder')}
              aria-label={t('skills.filters.searchPlaceholder')}
            />
          </div>
          <div className="skills__cats">
            <button
              className={`skills__cat ${!category ? 'active' : ''}`}
              onClick={() => setCategory('')}
            >
              {t('skills.filters.all')}
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`skills__cat ${category === cat ? 'active' : ''}`}
                onClick={() => setCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="skills__grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skills__card-skeleton" />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="skills__empty">
            <Bot size={36} strokeWidth={1.25} />
            <h3>{t('skills.card.empty')}</h3>
            <p>{t('skills.card.emptyHint')}</p>
            <button className="skills__create-btn" onClick={() => navigate('/skills/create')}>
              <Plus size={15} />
              {t('skills.filters.create')}
            </button>
          </div>
        ) : (
          <>
            <div className="skills__grid">
              {skills.map(skill => (
                <article
                  key={skill.id}
                  className="skills__card"
                  onClick={() => navigate(`/skills/${skill.slug || skill.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') navigate(`/skills/${skill.slug || skill.id}`); }}
                >
                  <div className="skills__card-top">
                    <span className="skills__card-cat">{skill.category}</span>
                    <span className="skills__card-badges">
                      {skill.aiGenerated && (
                        <span className="skills__badge skills__badge--ai"><Sparkles size={10} />{t('skills.card.aiGenerated')}</span>
                      )}
                      {skill.status === 'published' && (
                        <span className="skills__badge skills__badge--ready"><Bot size={10} />{t('skills.card.agentReady')}</span>
                      )}
                      {skill.visibility === 'private' && (
                        <span className="skills__badge"><Lock size={10} />{t('skills.card.private')}</span>
                      )}
                      {skill.status === 'draft' && (
                        <span className="skills__badge"><FileEdit size={10} />{t('skills.card.draft')}</span>
                      )}
                    </span>
                  </div>
                  <h3 className="skills__card-name">{skill.name}</h3>
                  <p className="skills__card-desc">{skill.description}</p>
                  <div className="skills__card-tags">
                    {(skill.tags || []).slice(0, 4).map(tag => (
                      <span key={tag} className="skills__tag">{tag}</span>
                    ))}
                  </div>
                  <div className="skills__card-footer">
                    <span className="skills__card-author">
                      {skill.author.avatar
                        ? <img src={skill.author.avatar} alt="" className="skills__card-avatar" />
                        : <span className="skills__card-avatar skills__card-avatar--letter">{(skill.author.name || 'A')[0].toUpperCase()}</span>}
                      {t('skills.card.by')} {skill.author.name}
                    </span>
                    <span className="skills__card-actions">
                      {skill.status !== 'draft' && (
                        <button
                          className="skills__use-btn"
                          onClick={e => handleUseInWorkspace(e, skill)}
                          aria-label={t('skills.card.useInWorkspace')}
                        >
                          <Bot size={13} />
                          <span>{t('skills.card.useInWorkspace')}</span>
                        </button>
                      )}
                      <button
                        className={`skills__icon-btn ${skill.liked ? 'liked' : ''}`}
                        onClick={e => handleLike(e, skill)}
                        aria-label={t('skills.detail.like')}
                      >
                        <Heart size={14} />
                        {formatCount(skill.likes)}
                      </button>
                      <button
                        className="skills__icon-btn"
                        onClick={e => handleInstall(e, skill)}
                        aria-label={t('skills.detail.install')}
                      >
                        <Download size={14} />
                        {formatCount(skill.installCount)}
                      </button>
                    </span>
                  </div>
                </article>
              ))}
            </div>
            {total > skills.length && (
              <p className="skills__more-hint">{formatCount(total)} total</p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
