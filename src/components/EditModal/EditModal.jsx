import { useState } from 'react';
import { X, Tag, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { normalizePromptCategory } from '../../utils/promptCategory';
import './EditModal.css';

const CATEGORIES = ['Portrait', 'Landscape', 'Editorial', 'Abstract', 'Fashion', 'Street'];

export default function EditModal({ prompt, onSave, onDelete, onClose }) {
  const { t } = useTranslation();
  const [promptText, setPromptText] = useState(prompt.prompt);
  const [tagsInput, setTagsInput] = useState(prompt.tags.join(', '));
  const [category, setCategory] = useState(prompt.category);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5);
  const recommendedCategory = normalizePromptCategory({
    prompt: promptText,
    tags,
    manualCategory: category || prompt.category || 'Generated',
  });
  const canSave = promptText.trim().length >= 10;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({ prompt: promptText.trim(), tags, category: recommendedCategory });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="edit-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="edit-modal"
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="edit-modal__header">
          <h2 className="edit-modal__title">{t('editModal.title')}</h2>
          <button className="edit-modal__close" onClick={onClose} aria-label={t('editModal.close')}>
            <X size={18} />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {showDeleteConfirm ? (
            <motion.div
              key="delete-confirm"
              className="edit-modal__body"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="edit-modal__delete-confirm">
                <div className="edit-modal__delete-icon">
                  <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="18" stroke="var(--color-accent)" strokeWidth="2"/>
                    <path d="M14 20h12M20 14v8" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="edit-modal__delete-message">{t('editModal.deleteConfirm')}</p>
                <div className="edit-modal__delete-actions">
                  <button
                    className="edit-modal__btn edit-modal__btn--ghost"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={saving}
                  >
                    {t('editModal.cancel')}
                  </button>
                  <button
                    className="edit-modal__btn edit-modal__btn--danger"
                    onClick={handleDelete}
                    disabled={saving}
                  >
                    {saving ? t('editModal.deleting') : t('editModal.delete')}
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="edit-form"
              className="edit-modal__body"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              {/* Prompt text */}
              <div className="edit-modal__field">
                <label className="edit-modal__label">{t('editModal.promptLabel')}</label>
                <textarea
                  className="edit-modal__textarea"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={6}
                />
                <div className="edit-modal__char-count">
                  {promptText.length} {t('editModal.chars')}
                  {promptText.length < 30 && promptText.length > 0 && (
                    <span className="edit-modal__char-hint"> — {t('editModal.minChars')}</span>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="edit-modal__field">
                <label className="edit-modal__label">
                  <Tag size={13} /> {t('editModal.tagsLabel')}
                </label>
                <input
                  type="text"
                  className="edit-modal__input"
                  placeholder={t('editModal.tagsPlaceholder')}
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
                {tags.length > 0 && (
                  <div className="edit-modal__tags-preview">
                    {tags.map(tag => <span key={tag} className="edit-modal__tag">{tag}</span>)}
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="edit-modal__field">
                <label className="edit-modal__label">
                  <Layers size={13} /> {t('editModal.categoryLabel')}
                </label>
                <p className="edit-modal__hint">
                  Auto category: <strong>{recommendedCategory}</strong>
                </p>
                <div className="edit-modal__category-grid">
                  {CATEGORIES.map(cat => {
                    const key = `explore.filter.${cat.toLowerCase()}`;
                    const label = t(key) !== key ? t(key) : cat;
                    return (
                      <button
                        key={cat}
                        className={`edit-modal__cat-btn ${category === cat ? 'active' : ''}`}
                        onClick={() => setCategory(cat)}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!showDeleteConfirm && (
          <div className="edit-modal__footer">
            <button
              className="edit-modal__btn edit-modal__btn--danger-ghost"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving}
            >
              {t('editModal.deletePrompt')}
            </button>
            <div className="edit-modal__footer-right">
              <button
                className="edit-modal__btn edit-modal__btn--ghost"
                onClick={onClose}
                disabled={saving}
              >
                {t('editModal.cancel')}
              </button>
              <button
                className="edit-modal__btn edit-modal__btn--primary"
                onClick={handleSave}
                disabled={!canSave || saving}
              >
                {saving ? t('editModal.saving') : t('editModal.save')}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
