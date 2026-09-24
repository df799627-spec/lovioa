import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, Cpu, Image, Layers3, Maximize2, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useLocale } from '../../hooks/useLocale';
import { trackAction } from '../../services/analytics';
import { DEFAULT_IMAGE_MODEL, getImageModelConfig, IMAGE_MODEL_OPTIONS } from '../../config/imageModels';
import { normalizePromptCategory } from '../../utils/promptCategory';
import { api } from '../../services/api';
import { showToast } from '../../App';
import ComposerSelect from './ComposerSelect';
import ComposerMentionPicker from './ComposerMentionPicker';
import GenerateModal from '../GenerateModal/GenerateModal';
import TryPromptModal from '../TryPromptModal/TryPromptModal';
import './Hero.css';

const DEFAULT_SIZE = import.meta.env.VITE_OPENAI_IMAGE_SIZE || '1024x1024';
const DEFAULT_QUALITY = import.meta.env.VITE_OPENAI_IMAGE_QUALITY || 'standard';
const COMPOSER_IMAGE_SIZES = ['1K', '2K', '4K'];
const COMPOSER_ASPECT_RATIOS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9'];
const EDITABLE_MODEL = IMAGE_MODEL_OPTIONS.find(option => option.supportsEdit)?.value || DEFAULT_IMAGE_MODEL;

function getMentionContext(value) {
  const match = /(?:^|\s)@([^\s]*)$/.exec(value);
  if (!match) return null;
  return {
    query: match[1],
    start: value.length - match[1].length - 1,
    end: value.length,
  };
}

export default function Hero() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser, prompts, savedIds } = useApp();
  const { image } = useLocale();

  const [query, setQuery] = useState('');
  const [retouchImage, setRetouchImage] = useState(null);
  const [retouchImagePreview, setRetouchImagePreview] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generationParams, setGenerationParams] = useState(null);
  const [composerModel, setComposerModel] = useState(DEFAULT_IMAGE_MODEL);
  const [composerImageSize, setComposerImageSize] = useState('2K');
  const [composerAspectRatio, setComposerAspectRatio] = useState('auto');
  const [composerMention, setComposerMention] = useState(null);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [tryComposerOpen, setTryComposerOpen] = useState(false);
  const [isQueueingTry, setIsQueueingTry] = useState(false);
  const [tryQueueError, setTryQueueError] = useState('');
  const [isRefiningPrompt, setIsRefiningPrompt] = useState(false);
  const [refineError, setRefineError] = useState('');
  const fileRef = useRef(null);
  const composerInputRef = useRef(null);
  const savedImagePrompts = prompts.filter(prompt => savedIds.has(prompt.id) && prompt.imageUrl);
  const composerModelOptions = IMAGE_MODEL_OPTIONS;

  useEffect(() => {
    const handleTryPrompt = (event) => {
      const prompt = event.detail?.prompt;
      if (!prompt) return;

      setQuery(prompt);
      setTryComposerOpen(true);
      setTryQueueError('');
      setRetouchImage(null);
      setRetouchImagePreview('');
      setComposerMention(null);
      setShowMentionPicker(false);
      if (fileRef.current) fileRef.current.value = '';
      requestAnimationFrame(() => {
        composerInputRef.current?.focus();
      });
    };

    window.addEventListener('__prompt_try__', handleTryPrompt);
    return () => window.removeEventListener('__prompt_try__', handleTryPrompt);
  }, []);

  const handleRetouchFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setComposerMention(null);
    if (!getImageModelConfig(composerModel).supportsEdit) setComposerModel(EDITABLE_MODEL);
    setRetouchImage(file);
    const reader = new FileReader();
    reader.onload = event => setRetouchImagePreview(event.target.result);
    reader.readAsDataURL(file);
  };

  const handlePaste = (event) => {
    const pastedImage = [...(event.clipboardData?.files || [])]
      .find(file => file.type.startsWith('image/'));
    if (!pastedImage) return;
    event.preventDefault();
    handleRetouchFile(pastedImage);
  };

  const removeRetouchImage = () => {
    setRetouchImage(null);
    setRetouchImagePreview('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeComposerMention = () => {
    setComposerMention(null);
    setShowMentionPicker(false);
  };

  const handleComposerQueryChange = (value) => {
    setQuery(value);
    setRefineError('');
    const context = getMentionContext(value);
    setMentionQuery(context?.query || '');
    setShowMentionPicker(Boolean(context));
  };

  const handleRefinePrompt = async () => {
    const prompt = query.trim();
    if (!prompt || isRefiningPrompt) return;

    setIsRefiningPrompt(true);
    setRefineError('');
    try {
      const result = await api.refinePrompt({
        prompt,
        mode: retouchImage || composerMention ? 'retouch' : 'text',
      });
      const refinedPrompt = result?.refinedPrompt?.trim();
      if (!refinedPrompt) throw new Error(t('hero.refineError'));

      setQuery(refinedPrompt);
      setMentionQuery('');
      setShowMentionPicker(false);
    } catch (error) {
      setRefineError(error?.status && error.status < 500
        ? error.message
        : t('hero.refineError'));
    } finally {
      setIsRefiningPrompt(false);
    }
  };

  const handleComposerKeyDown = (event) => {
    if (event.key === 'Escape' && showMentionPicker) {
      event.preventDefault();
      setShowMentionPicker(false);
    }
  };

  const handleMentionSelect = (prompt) => {
    const context = getMentionContext(query);
    if (context) {
      const before = query.slice(0, context.start).trimEnd();
      const after = query.slice(context.end).trimStart();
      setQuery([before, after].filter(Boolean).join(' '));
    }
    setComposerMention(prompt);
    if (!getImageModelConfig(composerModel).supportsEdit) setComposerModel(EDITABLE_MODEL);
    setShowMentionPicker(false);
    setMentionQuery('');
    setRetouchImage(null);
    setRetouchImagePreview('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleComposerModelChange = (value) => {
    const hasReference = Boolean(retouchImage || composerMention);
    setComposerModel(hasReference && !getImageModelConfig(value).supportsEdit ? EDITABLE_MODEL : value);
  };

  const handleGenerateClick = (params) => {
    if (!currentUser) {
      navigate('/auth', { state: { from: '/' } });
      return;
    }
    setGenerationParams(params);
    setShowGenerate(true);
    trackAction('act_generate_start', { source: 'hero', mode: params.mode });
  };

  const handleTryQueueSubmit = async (prompt) => {
    if (!currentUser) {
      navigate('/auth', { state: { from: '/' } });
      return;
    }

    setIsQueueingTry(true);
    setTryQueueError('');

    const referencePrompt = retouchImage || composerMention;
    const mode = referencePrompt ? 'edit' : 'text';
    const model = referencePrompt && !getImageModelConfig(composerModel).supportsEdit
      ? EDITABLE_MODEL
      : composerModel;
    const inferredCategory = normalizePromptCategory({
      prompt,
      tags: [],
      manualCategory: 'Generated',
    });

    try {
      const jobPayload = {
        model,
        size: DEFAULT_SIZE,
        quality: DEFAULT_QUALITY,
        generationOptions: {
          aspectRatio: composerAspectRatio === 'auto' ? '1:1' : composerAspectRatio,
          imageSize: composerImageSize,
        },
        mode,
        prompt,
        negativePrompt: '',
        category: inferredCategory,
      };

      if (retouchImage) {
        const { url } = await api.uploadImage(retouchImage);
        jobPayload.referenceImageUrl = url;
        jobPayload.editStrength = 0.6;
      } else if (composerMention?.imageUrl) {
        jobPayload.referenceImageUrl = composerMention.imageUrl;
        jobPayload.editStrength = 0.6;
      }

      const jobResponse = await api.createGenJob(jobPayload);
      const jobId = jobResponse?.job?.id || jobResponse?.id;
      if (!jobId) throw new Error(t('hero.queueError'));

      trackAction('act_try_queue_success', { mode, model, category: inferredCategory });
      showToast(t('hero.queueToast'), 'success');
      setTryComposerOpen(false);
      setQuery('');
      setRetouchImage(null);
      setRetouchImagePreview('');
      setComposerMention(null);
      setShowMentionPicker(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      if (err.status === 401) {
        navigate('/auth', { state: { from: '/' } });
      } else {
        setTryQueueError(err.message || t('hero.queueError'));
        trackAction('act_try_queue_fail', {
          mode,
          model,
          category: inferredCategory,
          reason: err.status === 402 ? 'credits' : 'submit_error',
        });
      }
    } finally {
      setIsQueueingTry(false);
    }
  };

  const handleComposerSubmit = async (event) => {
    event.preventDefault();
    const prompt = query.trim();
    if (!prompt && !retouchImage && !composerMention) return;

    if (tryComposerOpen) {
      await handleTryQueueSubmit(prompt);
      return;
    }

    if (retouchImage || composerMention) {
      handleGenerateClick({
        mode: 'edit',
        prompt,
        image: retouchImage,
        referenceImageUrl: composerMention?.imageUrl || '',
        model: composerModel,
        aspectRatio: composerAspectRatio,
        imageSize: composerImageSize,
      });
      return;
    }

    navigate(`/?search=${encodeURIComponent(prompt)}`);
  };

  const handleGenerateSuccess = useCallback(() => {
    setShowGenerate(false);
    showToast(t('hero.successToast'), 'success');
  }, [t]);

  const heroBg = image('hero/bg');
  const hasComposerContent = Boolean(query.trim() || retouchImage || composerMention);
  const composerSubmitLabel = tryComposerOpen
    ? (isQueueingTry ? t('hero.queueing') : t('hero.queueBtn'))
    : (retouchImage || composerMention ? t('hero.generateBtn') : t('hero.sendBtn'));
  const composerImageSizeOptions = COMPOSER_IMAGE_SIZES.map(value => ({ value, label: value }));
  const composerAspectRatioOptions = COMPOSER_ASPECT_RATIOS.map(value => ({
    value,
    label: value === 'auto' ? t('hero.smartRatio') : value,
  }));

  return (
    <section className="hero">
      {heroBg && (
        <img
          key={heroBg}
          src={heroBg}
          alt=""
          className="hero__locale-bg"
          aria-hidden="true"
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="hero__bg-shape hero__bg-shape--1" aria-hidden />
      <div className="hero__bg-shape hero__bg-shape--2" aria-hidden />
      <div className="hero__bg-shape hero__bg-shape--3" aria-hidden />

      <div className="container">
        <motion.div
          className="hero__content"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="hero__eyebrow">
            <span className="hero__eyebrow-line" />
            {t('hero.badge')}
            <span className="hero__eyebrow-line" />
          </div>

          <h1 className="hero__title">
            {t('hero.title')}<br />
            <em>{t('hero.titleEm')}</em>
          </h1>

          <p className="hero__subtitle">{t('hero.subtitle')}</p>

          {!tryComposerOpen && <form
            className={`hero__composer ${dragOver ? 'is-drag-over' : ''} ${tryComposerOpen ? 'hero__composer--floating' : ''}`}
            onSubmit={handleComposerSubmit}
            onDragOver={event => { event.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={event => {
              event.preventDefault();
              setDragOver(false);
              handleRetouchFile(event.dataTransfer.files?.[0]);
            }}
            onPaste={handlePaste}
          >
            <div className="hero__composer-input-wrap">
              <textarea
                ref={composerInputRef}
                className="hero__composer-input"
                rows={4}
                placeholder={retouchImagePreview || composerMention
                  ? t('hero.composerWithImagePlaceholder')
                  : t('hero.composerPlaceholder')}
                value={query}
                onChange={event => handleComposerQueryChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                aria-label={t('hero.composerPlaceholder')}
              />
              {showMentionPicker && (
                <ComposerMentionPicker
                  items={savedImagePrompts}
                  query={mentionQuery}
                  onSelect={handleMentionSelect}
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
                <button
                  type="button"
                  className="hero__composer-attachment-remove"
                  onClick={removeRetouchImage}
                  aria-label={t('stylePanel.removeRef')}
                >
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
                  onClick={removeComposerMention}
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
                    onChange={event => handleRetouchFile(event.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className="hero__composer-attach"
                    onClick={() => fileRef.current?.click()}
                    aria-label={t('hero.attachImage')}
                    title={t('hero.attachImage')}
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
                    onClick={handleRefinePrompt}
                    disabled={!query.trim() || isRefiningPrompt}
                    aria-label={t('hero.refineBtn')}
                    title={t('hero.refineBtn')}
                  >
                    <Sparkles size={15} className={isRefiningPrompt ? 'is-refining' : ''} />
                    <span>{isRefiningPrompt ? t('hero.refining') : t('hero.refineBtn')}</span>
                  </button>
                </div>

                <span className="hero__composer-divider" aria-hidden="true" />

                <div className="hero__composer-settings" aria-label={t('hero.composerSettings')}>
                  <ComposerSelect
                    className="hero__composer-select--model"
                    icon={Cpu}
                    value={composerModel}
                    options={composerModelOptions}
                    onChange={handleComposerModelChange}
                    label={t('generateModal.model')}
                    renderValue={option => option?.shortLabel || option?.label}
                    renderOption={option => (
                      <span className="hero__composer-model-option">
                        <strong>{option?.shortLabel || option?.label}</strong>
                        <small>{option?.modelName || option?.value}</small>
                      </span>
                    )}
                  />
                  <ComposerSelect
                    icon={Sparkles}
                    value={composerImageSize}
                    options={composerImageSizeOptions}
                    onChange={setComposerImageSize}
                    label={t('generateModal.imageSize')}
                  />
                  <ComposerSelect
                    icon={Maximize2}
                    value={composerAspectRatio}
                    options={composerAspectRatioOptions}
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
                  disabled={!hasComposerContent || isQueueingTry}
                  aria-label={composerSubmitLabel}
                >
                  <Send size={16} />
                  <span>{composerSubmitLabel}</span>
                </button>
              </div>
            </div>
            {(tryQueueError || refineError) && (
              <p className="hero__composer-error">{tryQueueError || refineError}</p>
            )}
          </form>}
        </motion.div>
      </div>

      {tryComposerOpen && (
        <TryPromptModal
          t={t}
          query={query}
          retouchImage={retouchImage}
          retouchImagePreview={retouchImagePreview}
          composerImageSize={composerImageSize}
          setComposerImageSize={setComposerImageSize}
          composerAspectRatio={composerAspectRatio}
          setComposerAspectRatio={setComposerAspectRatio}
          composerModel={composerModel}
          setComposerModel={handleComposerModelChange}
          composerModelOptions={composerModelOptions}
          composerInputRef={composerInputRef}
          fileRef={fileRef}
          hasComposerContent={hasComposerContent}
          composerMention={composerMention}
          showMentionPicker={showMentionPicker}
          mentionQuery={mentionQuery}
          savedImagePrompts={savedImagePrompts}
          isQueueing={isQueueingTry}
          isRefining={isRefiningPrompt}
          submitLabel={composerSubmitLabel}
          refineError={refineError}
          error={tryQueueError || refineError}
          onSubmit={handleComposerSubmit}
          onRefine={handleRefinePrompt}
          onClose={() => {
            setTryComposerOpen(false);
            setTryQueueError('');
            setRefineError('');
          }}
          onFileChange={handleRetouchFile}
          onQueryChange={handleComposerQueryChange}
          onKeyDown={handleComposerKeyDown}
          onSelectMention={handleMentionSelect}
          onRemoveMention={removeComposerMention}
          onPaste={handlePaste}
          onDropFile={handleRetouchFile}
          onRemoveImage={removeRetouchImage}
        />
      )}

      {showGenerate && (
        <GenerateModal
          initialPrompt={generationParams?.prompt || ''}
          initialMode={generationParams?.mode || 'text'}
          initialImage={generationParams?.image || null}
          initialReferenceImageUrl={generationParams?.referenceImageUrl || ''}
          initialModel={generationParams?.model || composerModel}
          initialInstruction={generationParams?.prompt || ''}
          initialAspectRatio={generationParams?.aspectRatio || '1:1'}
          initialImageSize={generationParams?.imageSize || '1K'}
          autoCloseOnSuccess
          onSuccess={handleGenerateSuccess}
          onClose={() => {
            setShowGenerate(false);
            setGenerationParams(null);
          }}
        />
      )}
    </section>
  );
}
