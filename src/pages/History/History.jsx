import { useState } from 'react';
import { Trash2, Copy, Check, ExternalLink, Trash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import './History.css';

export default function History() {
  const { t } = useTranslation();
  const { generationHistory, removeFromHistory, clearHistory } = useApp();
  const [copiedId, setCopiedId] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="history-page">
      <div className="container">
        <div className="history-page__header">
          <div className="history-page__header-text">
            <h1 className="history-page__title">{t('history.title')}</h1>
            <p className="history-page__subtitle">{t('history.subtitle', { count: generationHistory.length })}</p>
          </div>
          {generationHistory.length > 0 && (
            <button
              className="history-page__clear-btn"
              onClick={() => setShowClearConfirm(true)}
              title={t('history.clearAll')}
            >
              <Trash size={14} />
              {t('history.clearAll')}
            </button>
          )}
        </div>

        <AnimatePresence>
          {showClearConfirm && (
            <motion.div
              className="history-page__confirm"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <p className="history-page__confirm-text">{t('history.clearConfirm')}</p>
              <div className="history-page__confirm-actions">
                <button
                  className="history-page__confirm-cancel"
                  onClick={() => setShowClearConfirm(false)}
                >
                  {t('history.clearCancel')}
                </button>
                <button
                  className="history-page__confirm-confirm"
                  onClick={() => { clearHistory(); setShowClearConfirm(false); }}
                >
                  {t('history.clearConfirmBtn')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {generationHistory.length > 0 ? (
          <div className="history-page__grid">
            {generationHistory.map((item, i) => (
              <motion.div key={item.id} className="history-card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.06 }}>
                <div className="history-card__image-wrap">
                  <img
                    src={item.imageUrl}
                    alt="Generated"
                    className="history-card__image"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.closest('.history-card__image-wrap')?.classList.add('history-card__image-wrap--broken');
                      e.currentTarget.remove();
                    }}
                  />
                  <div className="history-card__model-tag">{item.model}</div>
                  <button className="history-card__delete" onClick={() => removeFromHistory(item.id)} title={t('history.delete')}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="history-card__body">
                  <p className="history-card__prompt">{item.prompt}</p>
                  <div className="history-card__meta">
                    <span className="history-card__date">{formatDate(item.createdAt)}</span>
                    <div className="history-card__actions">
                      <button className={`history-card__action ${copiedId === item.id ? 'copied' : ''}`} onClick={() => handleCopy(item.prompt, item.id)} title={t('history.copyPrompt')}>
                        {copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}
                        <span>{copiedId === item.id ? t('history.copied') : t('history.copyPrompt')}</span>
                      </button>
                      <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="history-card__action" title={t('history.openImage')}>
                        <ExternalLink size={13} />
                        <span>{t('history.openImage')}</span>
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="history-page__empty">
            <div className="history-page__empty-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="18" stroke="var(--color-border)" strokeWidth="2"/>
                <path d="M24 14v10l6 4" stroke="var(--color-border)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="history-page__empty-title">{t('history.empty.title')}</h3>
            <p className="history-page__empty-text">{t('history.empty.text')}</p>
            <a href="/" className="history-page__explore-btn">{t('history.empty.cta')}</a>
          </div>
        )}
      </div>
    </div>
  );
}
