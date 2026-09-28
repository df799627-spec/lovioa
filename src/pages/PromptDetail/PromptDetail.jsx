import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Heart, Tag, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { trackAction } from '../../services/analytics';
import { DEFAULT_IMAGE_MODEL } from '../../config/imageModels';
import { normalizePromptCategory } from '../../utils/promptCategory';
import { showToast } from '../../App';
import StylePanel from '../../components/StylePanel/StylePanel';
import PromptCard from '../../components/PromptCard/PromptCard';
import EditModal from '../../components/EditModal/EditModal';
import SEO, { imageObjectJsonLd, breadcrumbJsonLd } from '../../components/SEO/SEO';
import ShareButton from '../../components/ShareButton/ShareButton';
import './PromptDetail.css';

export default function PromptDetail() {
  const { t, i18n } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    prompts,
    toggleLike,
    likedIds,
    updateLocalPrompt,
    removePrompt,
    currentUser,
    registerGenerationJob,
  } = useApp();
  const [copied, setCopied] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  const prompt = useMemo(() => prompts.find(p => p.id === id), [prompts, id]);
  const related = useMemo(
    () => prompts.filter(p => p.category === prompt?.category && p.id !== id).slice(0, 3),
    [prompts, prompt, id]
  );
  const liked = likedIds.has(id);
  const isAuthor = currentUser && prompt?.author?.userId === currentUser.id;
  const isChinese = (i18n.resolvedLanguage || i18n.language || '').toLowerCase().startsWith('zh');
  const displayPrompt = isChinese
    ? (prompt?.promptZh || prompt?.prompt || '')
    : (prompt?.prompt || '');

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

  const handleGenerate = async (params) => {
    if (!currentUser) {
      navigate('/auth', { state: { from: `/prompt/${id}` } });
      return;
    }

    setIsQueueing(true);
    try {
      const mode = params.mode === 'reference' ? 'edit' : 'text';
      const promptText = mode === 'edit' ? params.prompt || prompt.prompt : params.prompt;
      const jobPayload = {
        model: DEFAULT_IMAGE_MODEL,
        size: import.meta.env.VITE_OPENAI_IMAGE_SIZE || '1024x1024',
        quality: import.meta.env.VITE_OPENAI_IMAGE_QUALITY || 'standard',
        generationOptions: {
          aspectRatio: '1:1',
          imageSize: '2K',
        },
        mode,
        prompt: promptText,
        negativePrompt: '',
        category: normalizePromptCategory({
          prompt: promptText,
          tags: prompt.tags || [],
          manualCategory: prompt.category || 'Generated',
        }),
      };

      if (mode === 'edit' && params.image) {
        const { url } = await api.uploadImage(params.image);
        jobPayload.referenceImageUrl = url;
        jobPayload.editStrength = params.strength ?? 0.6;
      }

      const response = await api.createGenJob(jobPayload);
      const job = response?.job || response;
      if (!job?.id) throw new Error(t('hero.queueError'));
      registerGenerationJob(job);
      trackAction('act_queue_success', { mode, model: DEFAULT_IMAGE_MODEL, promptId: id });
      showToast(t('hero.queueToast'), 'success');
    } catch (error) {
      if (error.status === 401) {
        navigate('/auth', { state: { from: `/prompt/${id}` } });
      } else {
        showToast(error.message || t('hero.queueError'), 'error');
      }
    } finally {
      setIsQueueing(false);
    }
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
            <p className="prompt-detail__prompt-text">{displayPrompt}</p>
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
          disabled={isQueueing}
        >
          {isQueueing ? t('hero.queueing') : t('promptDetail.generate')}
        </button>
      </div>
      </div>
    </>
  );
}
