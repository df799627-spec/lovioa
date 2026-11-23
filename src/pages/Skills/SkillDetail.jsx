import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Download, Heart, Share2, Copy, Check, Sparkles, Bot, Lock, FileEdit, Pencil, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { showToast } from '../../App';
import './Skills.css';

export default function SkillDetail() {
  const { idOrSlug } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentUser } = useApp();
  const [skill, setSkill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSkill(idOrSlug);
      setSkill(data);
    } catch (e) {
      if (e.status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [idOrSlug]);

  useEffect(() => { load(); }, [load]);

  const isOwner = skill?.author?.userId && currentUser?.id === skill.author.userId;

  const handleLike = async () => {
    try {
      const res = await api.toggleSkillLike(skill.id);
      setSkill(prev => ({ ...prev, liked: res.liked, likes: res.likes }));
    } catch (e) {
      if (e.status === 401) navigate('/auth');
    }
  };

  const handleInstall = async () => {
    window.open(api.skillExportUrl(skill.id), '_blank');
    try { await api.installSkill(skill.id); } catch { /* best-effort */ }
  };

  const handleUseInWorkspace = () => {
    navigate(`/workspace?skill=${encodeURIComponent(skill.slug || skill.id)}`);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(skill.instructions);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: skill.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        showToast(t('skills.detail.copied'));
      }
    } catch { /* user cancelled or unavailable */ }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('skills.detail.deleteConfirm'))) return;
    try {
      await api.deleteSkill(skill.id);
      showToast(t('skills.detail.delete'));
      navigate('/skills');
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="skills skills__detail-loading container">
        <div className="skills__card-skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  if (notFound || !skill) {
    return (
      <div className="skills skills__detail-missing container">
        <p>{t('skills.card.empty')}</p>
        <Link to="/skills" className="skills__back-link"><ArrowLeft size={14} />{t('skills.detail.back')}</Link>
      </div>
    );
  }

  return (
    <div className="skills skills__detail">
      <main className="container skills__detail-main">
        <Link to="/skills" className="skills__back-link"><ArrowLeft size={14} />{t('skills.detail.back')}</Link>

        <header className="skills__detail-header">
          <div className="skills__detail-badges">
            <span className="skills__card-cat">{skill.category}</span>
            {skill.aiGenerated && <span className="skills__badge skills__badge--ai"><Sparkles size={10} />{t('skills.card.aiGenerated')}</span>}
            {skill.status === 'published' && <span className="skills__badge skills__badge--ready"><Bot size={10} />{t('skills.card.agentReady')}</span>}
            {skill.visibility === 'private' && <span className="skills__badge"><Lock size={10} />{t('skills.detail.private')}</span>}
            {skill.status === 'draft' && <span className="skills__badge"><FileEdit size={10} />{t('skills.detail.draft')}</span>}
          </div>
          <h1 className="skills__detail-title">{skill.name}</h1>
          <p className="skills__detail-desc">{skill.description}</p>
          <div className="skills__card-tags">
            {(skill.tags || []).map(tag => <span key={tag} className="skills__tag">{tag}</span>)}
          </div>
          <div className="skills__detail-meta">
            <span className="skills__card-author">
              {skill.author.avatar
                ? <img src={skill.author.avatar} alt="" className="skills__card-avatar" />
                : <span className="skills__card-avatar skills__card-avatar--letter">{(skill.author.name || 'A')[0].toUpperCase()}</span>}
              {t('skills.card.by')} {skill.author.name}
            </span>
            <span>v{skill.version}</span>
          </div>
          <div className="skills__detail-actions">
            {skill.status !== 'draft' && (
              <button className="skills__action-btn skills__action-btn--workspace" onClick={handleUseInWorkspace}>
                <Sparkles size={15} />{t('skills.detail.useInWorkspace')}
              </button>
            )}
            <button className="skills__action-btn skills__action-btn--primary" onClick={handleInstall}>
              <Download size={15} />{t('skills.detail.install')}
            </button>
            <button className={`skills__action-btn ${skill.liked ? 'liked' : ''}`} onClick={handleLike}>
              <Heart size={15} />{formatCount(skill.likes)}
            </button>
            <button className="skills__action-btn" onClick={handleShare}>
              <Share2 size={15} />{t('skills.detail.share')}
            </button>
            {isOwner && (
              <>
                <button className="skills__action-btn" onClick={() => navigate(`/skills/create?edit=${skill.id}`)}>
                  <Pencil size={15} />{t('skills.detail.edit')}
                </button>
                <button className="skills__action-btn skills__action-btn--danger" onClick={handleDelete}>
                  <Trash2 size={15} />{t('skills.detail.delete')}
                </button>
              </>
            )}
          </div>
          <p className="skills__export-hint">{t('skills.detail.exportHint')}</p>
        </header>

        <section className="skills__instructions">
          <div className="skills__instructions-head">
            <h2>{t('skills.detail.instructions')}</h2>
            <button className="skills__icon-btn" onClick={handleCopy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? t('skills.detail.copied') : t('skills.detail.copy')}
            </button>
          </div>
          <pre className="skills__instructions-body">{skill.instructions}</pre>
        </section>
      </main>
    </div>
  );
}

function formatCount(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n ?? 0);
}
