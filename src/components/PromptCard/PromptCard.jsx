import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Copy, Check, Bookmark, BookmarkCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { trackAction } from '../../services/analytics';
import ShareButton from '../ShareButton/ShareButton';
import './PromptCard.css';

export default function PromptCard({ prompt, index = 0, compact = false }) {
  const { likedIds, savedIds, toggleLike, toggleSave } = useApp();
  const { t } = useTranslation();
  const liked = likedIds.has(prompt.id);
  const saved = savedIds.has(prompt.id);
  const [copied, setCopied] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const isFeatured = index % 5 === 0;
  const isGenerated = prompt.category === 'Generated';
  const cardTitle = prompt.title || prompt.tags?.slice(0, 2).join(' · ') || prompt.category;

  const handleCopy = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(prompt.prompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      trackAction('act_copy_prompt', { promptId: prompt.id });
    });
  };

  const handleTry = (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('__prompt_try__', {
      detail: {
        prompt: `参考@图一的画面构图和色调风格，${prompt.prompt}，avoid：`,
      },
    }));
  };

  return (
    <motion.div
      className={`prompt-card ${compact ? 'prompt-card--compact' : ''}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: (index % 5) * 0.07 }}
    >
      <Link to={`/prompt/${prompt.id}`} className="prompt-card__link">
        <div className="prompt-card__image-wrap">
          {!imgFailed && (
            <img
              src={prompt.imageUrl}
              alt={prompt.category}
              className="prompt-card__image"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          )}
          {saved && (
            <div className="prompt-card__saved-badge">
              <BookmarkCheck size={13} />
            </div>
          )}
          {isGenerated && (
            <div className="prompt-grid__featured-label">Generated</div>
          )}
          {isFeatured && !isGenerated && (
            <div className="prompt-grid__featured-label">{t('promptCard.featured')}</div>
          )}

          {/* Hover overlay */}
          <div className="prompt-card__overlay">
            <div className="prompt-card__overlay-content">
              <p className="prompt-card__prompt-text">{prompt.prompt}</p>
              <div className="prompt-card__overlay-actions">
                <ShareButton
                  url={`/prompt/${prompt.id}`}
                  title={`${prompt.prompt.slice(0, 80)}...`}
                />
                <button
                  className={`prompt-card__action-btn ${copied ? 'copied' : ''}`}
                  onClick={handleCopy}
                  title={t('promptCard.copyPrompt')}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copied ? t('promptCard.copied') : t('promptCard.copy')}</span>
                </button>
                <button
                  type="button"
                  className="prompt-card__try-btn"
                  onClick={handleTry}
                >
                  {t('promptCard.tryThis')} →
                </button>
              </div>
            </div>
          </div>
        </div>

        {compact && (
          <div className="prompt-card__content">
            <strong className="prompt-card__title">{cardTitle}</strong>
            <p className="prompt-card__excerpt">{prompt.prompt}</p>
          </div>
        )}

        {/* Card footer */}
        <div className="prompt-card__footer">
          <div className="prompt-card__author">
            {prompt.author.userId ? (
              <Link
                to={`/profile/${prompt.author.userId}`}
                className="prompt-card__author-link"
                onClick={e => e.stopPropagation()}
              >
                <img
                  src={prompt.author.avatar}
                  alt={prompt.author.name}
                  className="prompt-card__avatar"
                />
              </Link>
            ) : (
              <img
                src={prompt.author.avatar}
                alt={prompt.author.name}
                className="prompt-card__avatar"
              />
            )}
            <div className="prompt-card__author-info">
              {prompt.author.userId ? (
                <Link
                  to={`/profile/${prompt.author.userId}`}
                  className="prompt-card__author-link"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="prompt-card__author-name">{prompt.author.name}</span>
                </Link>
              ) : (
                <span className="prompt-card__author-name">{prompt.author.name}</span>
              )}
              <span className="prompt-card__category">{prompt.category}</span>
            </div>
          </div>
          <div className="prompt-card__actions">
            <button
              className={`prompt-card__action ${liked ? 'liked' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleLike(prompt.id);
                trackAction('act_like', { promptId: prompt.id });
              }}
              aria-label={liked ? t('promptCard.unlike') : t('promptCard.like')}
            >
              <Heart size={13} fill={liked ? 'currentColor' : 'none'} />
              <span>{prompt.likes.toLocaleString()}</span>
            </button>
            <button
              className={`prompt-card__action ${saved ? 'saved' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSave(prompt.id);
                trackAction('act_save', { promptId: prompt.id });
              }}
              aria-label={saved ? t('promptCard.unsave') : t('promptCard.save')}
            >
              <Bookmark size={13} fill={saved ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
