import { createPortal } from 'react-dom';
import { AtSign, Cpu, Image, Layers3, Maximize2, Paperclip, Send, Sparkles, X } from 'lucide-react';
import ComposerSelect from '../Hero/ComposerSelect';
import ComposerMentionPicker from '../Hero/ComposerMentionPicker';
import './TryPromptModal.css';

export default function TryPromptModal({
  t,
  query,
  retouchImage,
  retouchImagePreview,
  composerImageSize,
  setComposerImageSize,
  composerAspectRatio,
  setComposerAspectRatio,
  composerModel,
  setComposerModel,
  composerModelOptions,
  composerInputRef,
  fileRef,
  hasComposerContent,
  composerMention,
  showMentionPicker,
  mentionQuery,
  savedImagePrompts,
  isQueueing,
  isRefining,
  submitLabel,
  error,
  refineError,
  onSubmit,
  onRefine,
  onClose,
  onFileChange,
  onQueryChange,
  onKeyDown,
  onSelectMention,
  onRemoveMention,
  onPaste,
  onDropFile,
  onRemoveImage,
}) {
  return createPortal(
    <div
      className="try-prompt-modal"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="hero__composer hero__composer--floating"
        onSubmit={onSubmit}
        onPaste={onPaste}
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault();
          onDropFile(event.dataTransfer.files?.[0]);
        }}
      >
        <div className="try-prompt-modal__header">
          <div>
            <span className="try-prompt-modal__eyebrow">{t('hero.tryModalEyebrow')}</span>
            <h2 className="try-prompt-modal__title">{t('hero.tryModalTitle')}</h2>
          </div>
          <button type="button" className="try-prompt-modal__close" onClick={onClose} aria-label={t('nav.closeMenu')}>
            <X size={18} />
          </button>
        </div>

        <div className="hero__composer-input-wrap">
          <textarea
            ref={composerInputRef}
            className="hero__composer-input"
            rows={5}
            placeholder={composerMention ? t('hero.composerWithImagePlaceholder') : t('hero.composerPlaceholder')}
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t('hero.composerPlaceholder')}
          />
          {showMentionPicker && (
            <ComposerMentionPicker
              items={savedImagePrompts}
              query={mentionQuery}
              onSelect={onSelectMention}
              emptyLabel={t('hero.mentionEmpty')}
              hintLabel={t('hero.mentionHint')}
            />
          )}
        </div>

        {retouchImagePreview && (
          <div className="hero__composer-attachment">
            <img src={retouchImagePreview} alt={t('hero.retouchUploaded')} />
            <div className="hero__composer-attachment-meta">
              <span className="hero__composer-attachment-icon"><Image size={14} /></span>
              <span>{t('hero.retouchUploaded')}</span>
            </div>
            <button type="button" className="hero__composer-attachment-remove" onClick={onRemoveImage}>
              <X size={13} />
            </button>
          </div>
        )}

        {composerMention && (
          <div className="hero__composer-mention">
            <img src={composerMention.imageUrl} alt="" />
            <span className="hero__composer-mention-copy">
              <span className="hero__composer-mention-label">
                <AtSign size={12} />
                {t('hero.mentionReference')}
              </span>
              <strong>{composerMention.category || t('hero.mentionSavedImage')}</strong>
            </span>
            <button
              type="button"
              className="hero__composer-mention-remove"
              onClick={onRemoveMention}
              aria-label={t('stylePanel.removeRef')}
            >
              <X size={13} />
            </button>
          </div>
        )}

        <div className="hero__composer-toolbar">
          <div className="hero__composer-left">
            <div className="hero__composer-tools">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hero__file-input"
                onChange={event => onFileChange(event.target.files?.[0])}
              />
              <button
                type="button"
                className="hero__composer-attach"
                onClick={() => fileRef.current?.click()}
                aria-label={t('hero.attachImage')}
              >
                <Paperclip size={16} />
                <span className="hero__composer-attach-label">{t('hero.attachImage')}</span>
              </button>
              <span className="hero__composer-hint">
                {retouchImage ? t('hero.retouchUploaded') : t('hero.attachHint')}
              </span>
              <button
                type="button"
                className="hero__composer-refine"
                onClick={onRefine}
                disabled={!query.trim() || isRefining}
                aria-label={t('hero.refineBtn')}
                title={t('hero.refineBtn')}
              >
                <Sparkles size={15} className={isRefining ? 'is-refining' : ''} />
                <span>{isRefining ? t('hero.refining') : t('hero.refineBtn')}</span>
              </button>
            </div>

            <span className="hero__composer-divider" aria-hidden="true" />

            <div className="hero__composer-settings" aria-label={t('hero.composerSettings')}>
              <ComposerSelect
                className="hero__composer-select--model"
                icon={Cpu}
                value={composerModel}
                options={composerModelOptions}
                onChange={setComposerModel}
                label={t('generateModal.model')}
                renderValue={option => option?.shortLabel || option?.label}
                renderOption={option => (
                  <span className="hero__composer-model-option">
                    <strong>{option?.shortLabel || option?.label}</strong>
                    <small>{option?.capability}</small>
                  </span>
                )}
              />
              <ComposerSelect
                icon={Sparkles}
                value={composerImageSize}
                options={['1K', '2K', '4K'].map(value => ({ value, label: value }))}
                onChange={setComposerImageSize}
                label={t('generateModal.imageSize')}
              />
              <ComposerSelect
                icon={Maximize2}
                value={composerAspectRatio}
                options={['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9'].map(value => ({
                  value,
                  label: value === 'auto' ? t('hero.smartRatio') : value,
                }))}
                onChange={setComposerAspectRatio}
                label={t('generateModal.aspectRatio')}
              />
              <span className="hero__composer-static-option" title={t('hero.singleImage')}>
                <Layers3 size={14} aria-hidden="true" />
                <span>{t('hero.singleImage')}</span>
              </span>
            </div>
          </div>

          <div className="hero__composer-actions">
            <button
              type="submit"
              className="hero__composer-submit"
              disabled={!hasComposerContent || isQueueing}
              aria-label={submitLabel}
            >
              <Send size={16} />
              <span>{submitLabel}</span>
            </button>
          </div>
        </div>

        {(error || refineError) && <p className="hero__composer-error">{error || refineError}</p>}
      </form>
    </div>,
    document.body
  );
}
