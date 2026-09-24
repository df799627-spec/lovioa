import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Heart, Tag, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { trackAction } from '../../services/analytics';
import StylePanel from '../../components/StylePanel/StylePanel';
import GenerateModal from '../../components/GenerateModal/GenerateModal';
import PromptCard from '../../components/PromptCard/PromptCard';
import EditModal from '../../components/EditModal/EditModal';
import SEO, { imageObjectJsonLd, breadcrumbJsonLd } from '../../components/SEO/SEO';
import ShareButton from '../../components/ShareButton/ShareButton';
import './PromptDetail.css';

export default function PromptDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { prompts, toggleLike, likedIds, updateLocalPrompt, removePrompt, currentUser } = useApp();
  const [copied, setCopied] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generationParams, setGenerationParams] = useState(null);
  const [showEdit, setShowEdit] = useState(false);

  const prompt = useMemo(() => prompts.find(p => p.id === id), [prompts, id]);
  const related = useMemo(
    () => prompts.filter(p => p.category === prompt?.category && p.id !== id).slice(0, 3),
    [prompts, prompt, id]
  );
  const liked = likedIds.has(id);
  const isAuthor = currentUser && prompt?.author?.userId === currentUser.id;

  if (!prompt) {
    return (
      <div className="prompt-detail__not-found container">
        <h1>{t('promptDetail.notFound')}</h1>
        <Link to="/" className="prompt-detail__back-link">← {t('promptDetail.back')}</Link>
      </div>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackAction('act_copy_prompt', { promptId: prompt.id });
    });
  };

  const handleGenerate = (params) => {
    if (!currentUser) {
      navigate('/auth', { state: { from: `/prompt/${id}` } });
      return;
    }
    setGenerationParams(params);
    setShowGenerate(true);
  };

  const handleSaveEdit = async ({ prompt: newPromptText, tags, category }) => {
    const updated = await api.updatePrompt(id, { prompt: newPromptText, tags, category });
    updateLocalPrompt(id, updated);
  };

  const handleDelete = async () => {
    await api.deletePrompt(id);
    removePrompt(id);
    navigate('/');
  };

  return (
    <>
      <SEO
        title={prompt.prompt.slice(0, 100)}
        description={prompt.prompt.slice(0, 155)}
        image={prompt.imageUrl}
        url={`/prompt/${id}`}
        type="article"
        author={prompt.author?.name}
        section={prompt.category}
        publishedAt={prompt.createdAt}
        jsonLd={{
          '@context': 'https://schema.org',
          '@graph': [
            imageObjectJsonLd({
              prompt: prompt.prompt,
              imageUrl: prompt.imageUrl,
              authorName: prompt.author?.name,
              url: `/prompt/${id}`,
            }),
            breadcrumbJsonLd([
              { name: 'Home', url: '/' },
              { name: prompt.category, url: `/?category=${prompt.category}` },
              { name: prompt.prompt.slice(0, 50), url: `/prompt/${id}` },
            ]),
          ],
        }}
      />
      <div className="prompt-detail">
      <div className="prompt-detail__nav container">
        <Link to="/" className="prompt-detail__back">
          <ArrowLeft size={16} />
          {t('promptDetail.back')}
        </Link>
      </div>

      <div className="prompt-detail__layout container">
        {/* Left: image + info */}
        <motion.div
          className="prompt-detail__left"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="prompt-detail__image-wrap">
            <img src={prompt.imageUrl} alt={prompt.category} className="prompt-detail__image" />
            <div className="prompt-detail__image-badge">{prompt.category}</div>
            <div className="prompt-detail__share-btn">
              <ShareButton
                url={`/prompt/${id}`}
                title={`${prompt.prompt.slice(0, 80)}...`}
              />
            </div>
          </div>

          {/* Author */}
          <div className="prompt-detail__author">
            {prompt.author?.userId ? (
              <Link to={`/profile/${prompt.author.userId}`} className="prompt-detail__author-link">
                <img src={prompt.author.avatar} alt={prompt.author.name} className="prompt-detail__author-avatar" />
                <div>
                  <div className="prompt-detail__author-name">{prompt.author.name}</div>
                  <div className="prompt-detail__author-meta">{t('promptDetail.authorPrompts', { count: prompt.author.promptCount })}</div>
                </div>
              </Link>
            ) : (
              <>
                <img src={prompt.author.avatar} alt={prompt.author.name} className="prompt-detail__author-avatar" />
                <div>
                  <div className="prompt-detail__author-name">{prompt.author.name}</div>
                  <div className="prompt-detail__author-meta">{t('promptDetail.authorPrompts', { count: prompt.author.promptCount })}</div>
                </div>
              </>
            )}
          </div>

          {/* Prompt text */}
          <div className="prompt-detail__prompt-block">
            <div className="prompt-detail__prompt-label">
              <span>{t('promptDetail.prompt')}</span>
              <button className={`prompt-detail__copy-btn ${copied ? 'copied' : ''}`} onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? t('promptDetail.copied') : t('promptDetail.copy')}</span>
              </button>
            </div>
            <p className="prompt-detail__prompt-text">{prompt.prompt}</p>
          </div>

          {/* Tags */}
          <div className="prompt-detail__tags">
            <Tag size={14} className="prompt-detail__tag-icon" />
            <div className="prompt-detail__tag-list">
              {prompt.tags.map(tag => (
                <span key={tag} className="prompt-detail__tag">{tag}</span>
              ))}
            </div>
          </div>

          {/* Like */}
          <button
            className={`prompt-detail__like ${liked ? 'liked' : ''}`}
            onClick={() => { toggleLike(prompt.id); trackAction('act_like', { promptId: prompt.id }); }}
          >
            <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
            <span>{t('promptDetail.likes', { count: Number(prompt.likes || 0) })}</span>
          </button>
        </motion.div>

        {/* Right: style panel */}
        <motion.div
          className="prompt-detail__right"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
        >
          <div className="prompt-detail__style-panel-header">
            <span className="prompt-detail__style-panel-eyebrow">{t('stylePanel.eyebrow')}</span>
            <h2 className="prompt-detail__style-panel-title">{t('stylePanel.title')}</h2>
            <p className="prompt-detail__style-panel-desc">{t('stylePanel.desc')}</p>
          </div>
          <StylePanel prompt={prompt.prompt} onGenerate={handleGenerate} />
        </motion.div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="prompt-detail__related container">
          <h2 className="prompt-detail__related-title">
            {t('promptDetail.related', { category: prompt.category })}
          </h2>
          <div className="prompt-detail__related-grid">
            {related.map((p, i) => (
              <PromptCard key={p.id} prompt={p} index={i} />
            ))}
          </div>
        </div>
      )}

      {showGenerate && (
        <GenerateModal
          initialPrompt={
            generationParams?.mode === 'text'
              ? generationParams.prompt
              : prompt.prompt
          }
          initialMode={generationParams?.mode === 'reference' ? 'edit' : (generationParams?.mode || 'text')}
          initialImage={generationParams?.mode === 'reference' ? generationParams.image : null}
          initialInstruction={generationParams?.mode === 'reference' ? generationParams.prompt : ''}
          initialStrength={generationParams?.mode === 'reference' ? generationParams.strength : null}
          onClose={() => { setShowGenerate(false); setGenerationParams(null); }}
        />
      )}

      <AnimatePresence>
        {showEdit && (
          <EditModal
            prompt={prompt}
            onSave={handleSaveEdit}
            onDelete={handleDelete}
            onClose={() => setShowEdit(false)}
          />
        )}
      </AnimatePresence>

      {isAuthor && (
        <div className="prompt-detail__actions">
          <button className="prompt-detail__action-btn" onClick={() => setShowEdit(true)} title={t('editModal.editPrompt')}>
            <Pencil size={15} />
          </button>
        </div>
      )}

      {/* Mobile bottom bar */}
      <div className="prompt-detail__mobile-bar">
        <button
          className="prompt-detail__mobile-bar-btn prompt-detail__mobile-bar-btn--secondary"
          onClick={() => { toggleLike(prompt.id); trackAction('act_like', { promptId: prompt.id }); }}
        >
          <Heart size={16} fill={liked ? 'currentColor' : 'none'} />
          {prompt.likes}
        </button>
        <button
          className="prompt-detail__mobile-bar-btn prompt-detail__mobile-bar-btn--generate"
          onClick={() => handleGenerate({ mode: 'text', prompt: prompt.prompt })}
        >
          {t('promptDetail.generate')}
        </button>
      </div>
      </div>
    </>
  );
}
