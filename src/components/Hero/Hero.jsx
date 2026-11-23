import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AtSign, Bot, Cpu, Image, Layers3, Maximize2, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { useLocale } from '../../hooks/useLocale';
import { trackAction } from '../../services/analytics';
import {
  DEFAULT_IMAGE_MODEL,
  getImageModelConfig,
  VISIBLE_IMAGE_MODEL_OPTIONS,
} from '../../config/imageModels';
import { normalizePromptCategory } from '../../utils/promptCategory';
import { api } from '../../services/api';
import { showToast } from '../../App';
import { DEFAULT_AGENT_ID } from '../../config/agents';
import {
  collectAgentReferenceAssets,
  collectAgentStoryboardShots,
  collectAgentVideoOutputs,
  getAgentSteps,
} from '../../utils/agentArtifacts';
import ComposerSelect from './ComposerSelect';
import ComposerMentionPicker from './ComposerMentionPicker';
import MentionHighlight from './MentionHighlight';
import {
  extractMentionRefs,
  stripMentionRefs,
} from '../../utils/mentionTokens';
import TryPromptModal from '../TryPromptModal/TryPromptModal';
import './Hero.css';

const DEFAULT_SIZE = import.meta.env.VITE_OPENAI_IMAGE_SIZE || '1024x1024';
const DEFAULT_QUALITY = import.meta.env.VITE_OPENAI_IMAGE_QUALITY || 'standard';
const COMPOSER_IMAGE_SIZES = ['1K', '2K', '4K'];
const COMPOSER_ASPECT_RATIOS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '21:9'];
const EDITABLE_MODEL = VISIBLE_IMAGE_MODEL_OPTIONS.find(option => option.supportsEdit)?.value || DEFAULT_IMAGE_MODEL;

// 弹出选择器：只在光标位于未完成的 "@ref:" 前缀（或纯 "@"）后时触发。
// 选中的引用以严格 token @ref:N 落盘，识别完全确定性。
const CJK = '\u4e00-\u9fff\u3400-\u4dbf';
function getMentionContext(value, caret) {
  if (typeof caret !== 'number') return null;
  const before = value.slice(0, caret);
  const match = new RegExp(`(^|[\\s（(《【「,，。.、;；!！?？${CJK}])@(ref:?)$`).exec(before);
  if (!match) return null;
  return {
    query: '',
    start: caret - match[2].length - 1,
    end: caret,
  };
}

export default function Hero() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentUser, prompts, savedIds, registerGenerationJob } = useApp();
  const { image } = useLocale();

  const [query, setQuery] = useState('');
  const [composerMode, setComposerMode] = useState('standard');
  const [retouchImage, setRetouchImage] = useState(null);
  const [retouchImagePreview, setRetouchImagePreview] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [composerModel, setComposerModel] = useState(DEFAULT_IMAGE_MODEL);
  const [composerImageSize, setComposerImageSize] = useState('2K');
  const [composerAspectRatio, setComposerAspectRatio] = useState('auto');
  // 引用池：{ refIndex -> prompt }，@ref:N 的 N 指向这里的图片
  const [mentionPool, setMentionPool] = useState([]);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [tryComposerOpen, setTryComposerOpen] = useState(false);
  const [isQueueingTry, setIsQueueingTry] = useState(false);
  const [tryQueueError, setTryQueueError] = useState('');
  const [isRefiningPrompt, setIsRefiningPrompt] = useState(false);
  const [refineError, setRefineError] = useState('');
  const fileRef = useRef(null);
  const composerInputRef = useRef(null);
  const mentionOverlayRef = useRef(null);
  const savedImagePrompts = prompts.filter(prompt => savedIds.has(prompt.id) && prompt.imageUrl);
  const composerModelOptions = VISIBLE_IMAGE_MODEL_OPTIONS;

  useEffect(() => {
    const handleTryPrompt = (event) => {
      const prompt = event.detail?.prompt;
      if (!prompt) return;

      setQuery(prompt);
      setComposerMode('standard');
      setTryComposerOpen(true);
      setTryQueueError('');
      setRetouchImage(null);
      setRetouchImagePreview('');
      setMentionPool([]);
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
    setMentionPool([]);
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

  const removeComposerMention = (refIndex) => {
    setMentionPool(pool => pool.filter(item => item.refIndex !== refIndex));
    setQuery(text => text.replace(new RegExp(`(^|[\\s（(《【「,，。.、;；!！?？${CJK}])@ref:${refIndex}(?=$|[\\s（(《【「,，。.、;；!！?？${CJK}])`, 'g'), '$1').trim());
    setShowMentionPicker(false);
  };

  const handleComposerQueryChange = (value) => {
    setQuery(value);
    setRefineError('');
    // 用户开始输入时自动清掉 composer 内部的错误/摘要条，避免占用输入区
    setTryQueueError(current => current ? '' : current);
    // 引用池与文本中的 @ref:N token 保持同步：token 被手动删掉时，对应引用也移除
    const usedRefs = new Set(extractMentionRefs(value));
    setMentionPool(pool => {
      const kept = pool.filter(item => usedRefs.has(item.refIndex));
      return kept.length === pool.length ? pool : kept;
    });
    const context = getMentionContext(value, composerInputRef.current?.selectionStart);
    setMentionQuery(context?.query || '');
    setShowMentionPicker(Boolean(context));
  };

  // Keep the highlight overlay + textarea perfectly aligned while scrolling/typing.
  const syncMentionOverlay = () => {
    const overlay = mentionOverlayRef.current;
    const input = composerInputRef.current;
    if (!overlay || !input) return;
    overlay.scrollTop = input.scrollTop;
    overlay.scrollLeft = input.scrollLeft;
  };

  const handleRefinePrompt = async () => {
    const prompt = query.trim();
    if (!prompt || isRefiningPrompt) return;

    setIsRefiningPrompt(true);
    setRefineError('');
    // 引用 token 原样保留：AI 被要求在输出中原样保留 @ref:N
    try {
      const result = await api.refinePrompt({
        prompt,
        mode: retouchImage || mentionPool.length > 0 ? 'retouch' : 'text',
      });
      const refinedPrompt = result?.refinedPrompt?.trim();
      if (!refinedPrompt) throw new Error(t('hero.refineError'));

      setQuery(refinedPrompt);
      setShowMentionPicker(false);
    } catch (error) {
      setRefineError(error?.status && error.status < 500
        ? error.message
        : t('hero.refineError'));
      showToast(error?.status && error.status < 500 ? error.message : t('hero.refineError'), 'error');
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
    const caret = composerInputRef.current?.selectionStart;
    const context = getMentionContext(query, typeof caret === 'number' ? caret : query.length);
    const refIndex = mentionPool.length + 1;
    const token = `@ref:${refIndex}`;
    if (context) {
      const before = query.slice(0, context.start);
      const after = query.slice(context.end);
      const glueBefore = before && !/[\s（(《【「,，。.、;；!！?？]$/.test(before) ? ' ' : '';
      const glueAfter = after && !/^\s/.test(after) ? ' ' : '';
      setQuery(`${before}${glueBefore}${token} ${glueAfter}${after}`.replace(/\s{2,}/g, ' '));
    } else {
      setQuery(`${query ? `${query.trimEnd()} ` : ''}${token} `);
    }
    setMentionPool(pool => [...pool, { refIndex, prompt }]);
    if (!getImageModelConfig(composerModel).supportsEdit) setComposerModel(EDITABLE_MODEL);
    setShowMentionPicker(false);
    setMentionQuery('');
    setRetouchImage(null);
    setRetouchImagePreview('');
    if (fileRef.current) fileRef.current.value = '';
    requestAnimationFrame(() => composerInputRef.current?.focus());
  };

  const handleComposerModelChange = (value) => {
    const hasReference = Boolean(retouchImage || mentionPool.length > 0);
    setComposerModel(hasReference && !getImageModelConfig(value).supportsEdit ? EDITABLE_MODEL : value);
  };

  const handleQueueSubmit = async (prompt) => {
    if (!currentUser) {
      navigate('/auth', { state: { from: '/' } });
      return;
    }

    setIsQueueingTry(true);
    setTryQueueError('');

    // 根本方案：解析确定性 token @ref:N，而不是猜测自然语言里的 "@xxx"
    const usedRefs = extractMentionRefs(prompt);
    const referenceImages = usedRefs
      .map(refIndex => mentionPool.find(item => item.refIndex === refIndex))
      .filter(Boolean)
      .map(item => item.prompt)
    const firstReferencePrompt = retouchImage || referenceImages[0] || null;
    const mode = firstReferencePrompt ? 'edit' : 'text';
    const model = firstReferencePrompt && !getImageModelConfig(composerModel).supportsEdit
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
        prompt: stripMentionRefs(prompt),
        negativePrompt: '',
        category: inferredCategory,
      };

      if (retouchImage) {
        const { url } = await api.uploadImage(retouchImage);
        jobPayload.referenceImageUrl = url;
        jobPayload.editStrength = 0.6;
      } else if (referenceImages[0]?.imageUrl) {
        jobPayload.referenceImageUrl = referenceImages[0].imageUrl;
        jobPayload.editStrength = 0.6;
      }

      const jobResponse = await api.createGenJob(jobPayload);
      const jobId = jobResponse?.job?.id || jobResponse?.id;
      if (!jobId) throw new Error(t('hero.queueError'));
      registerGenerationJob(jobResponse?.job || jobResponse);

      trackAction('act_queue_success', { mode, model, category: inferredCategory });
      showToast(t('hero.queueToast'), 'success');
      setTryComposerOpen(false);
      setQuery('');
      setMentionPool([]);
      setRetouchImage(null);
      setRetouchImagePreview('');
      setShowMentionPicker(false);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      if (err.status === 401) {
        navigate('/auth', { state: { from: '/' } });
      } else {
        setTryQueueError(err.message || t('hero.queueError'));
        trackAction('act_queue_fail', {
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

  const handleAgentSubmit = async (prompt) => {
    if (!currentUser) {
      navigate('/auth', { state: { from: '/' } });
      return;
    }
    if (!prompt.trim()) {
      setTryQueueError(t('hero.agentPromptRequired'));
      return;
    }

    setIsQueueingTry(true);
    setTryQueueError('');

    try {
      // 引用池展开为上下文图片，序号与文本中的 @ref:N 一致
      const contextImages = mentionPool.map(item => ({
        title: item.prompt.category || t('hero.mentionSavedImage'),
        src: item.prompt.imageUrl,
      }));
      if (retouchImage) {
        const { url } = await api.uploadImage(retouchImage);
        if (!url) throw new Error(t('hero.agentReferenceUploadError'));
        contextImages.push({ title: t('hero.agentUploadedReference'), src: url });
      }

      const response = await api.runAgent({
        agentId: DEFAULT_AGENT_ID,
        prompt: stripMentionRefs(prompt),
        maxSteps: 10000,
        context: {
          imageModel: composerModel,
          imageSize: composerImageSize,
          imageAspectRatio: composerAspectRatio === 'auto' ? '1:1' : composerAspectRatio,
          images: contextImages,
        },
      });
      const steps = getAgentSteps(response);
      const runKey = response?.runId || Date.now();

      const imageJobs = steps
        .filter(step => step?.result?.type === 'image_job' && step.result.job?.id)
        .map(step => step.result.job);
      imageJobs.forEach(job => registerGenerationJob(job));

      const storyboardShots = collectAgentStoryboardShots(response, {
        runId: runKey,
        fallbackSrc: contextImages[0]?.src || '',
        referenceImages: contextImages.map((image, index) => ({
          index,
          title: image.title || '',
          meta: image.meta || '',
          url: image.src,
        })),
      });
      const referenceAssets = collectAgentReferenceAssets(response, { runId: runKey });
      const videoOutputs = collectAgentVideoOutputs(response, {
        runId: runKey,
        label: t('hero.agentVideoLabel'),
      });

      const hasWorkspaceArtifacts = imageJobs.length > 0
        || storyboardShots.length > 0
        || referenceAssets.length > 0
        || videoOutputs.length > 0;
      const message = response?.message || t('hero.agentCompleted');
      let savedConversationId = '';
      let persistenceError = null;

      if (response?.ok !== false && hasWorkspaceArtifacts) {
        savedConversationId = `conversation-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const now = new Date().toISOString();
        try {
          const saved = await api.saveWorkspaceConversation(savedConversationId, {
            id: savedConversationId,
            title: prompt.trim().slice(0, 80) || 'Agent 工作区',
            messages: [
              {
                id: `message-user-${runKey}`,
                role: 'user',
                text: prompt.trim(),
                time: '刚刚',
              },
              {
                id: `message-agent-${runKey}`,
                role: 'assistant',
                text: message,
                time: '刚刚',
                status: 'completed',
              },
            ],
            workspace: {
              shots: storyboardShots,
              referenceAssets,
              agentOutputs: videoOutputs,
              images: [],
              videos: [],
            },
            createdAt: now,
            updatedAt: now,
          });
          if (saved?.conversation?.id !== savedConversationId) {
            throw new Error('云端没有返回已保存的工作区对话');
          }
        } catch (error) {
          persistenceError = error;
        }
      }

      if (response?.ok === false) {
        // Agent 失败原因只走 toast + 可关闭的错误条，长摘要不塞进输入区
        showToast(message, 'error');
        setTryQueueError(message.length > 120 ? message.slice(0, 120) + '…' : message);
      } else if (persistenceError) {
        showToast(`生成已完成，但工作区云端保存失败：${persistenceError.message || '未知错误'}`, 'error');
      } else {
        showToast(message, 'success');
      }

      if (response?.ok !== false) {
        setQuery('');
        setMentionPool([]);
        setRetouchImage(null);
        setRetouchImagePreview('');
        setShowMentionPicker(false);
        if (fileRef.current) fileRef.current.value = '';
      }

      if (hasWorkspaceArtifacts && savedConversationId && !persistenceError) {
        navigate(`/workspace?conversation=${encodeURIComponent(savedConversationId)}`);
      }
    } catch (error) {
      if (error.status === 401) {
        navigate('/auth', { state: { from: '/' } });
      } else {
        setTryQueueError(error.message || t('hero.agentError'));
        showToast(error.message || t('hero.agentError'), 'error');
      }
    } finally {
      setIsQueueingTry(false);
    }
  };

  const handleComposerSubmit = async (event) => {
    event.preventDefault();
    const prompt = query.trim();
    if (!prompt && !retouchImage && mentionPool.length === 0) return;

    if (composerMode === 'agent') {
      await handleAgentSubmit(prompt);
      return;
    }
    await handleQueueSubmit(prompt);
  };

  const heroBg = image('hero/bg');
  const hasComposerContent = Boolean(query.trim() || retouchImage || mentionPool.length > 0);
  const composerSubmitLabel = isQueueingTry
    ? composerMode === 'agent' ? t('hero.agentRunning') : t('hero.queueing')
    : composerMode === 'agent' ? t('hero.agentRun') : t('hero.generateBtn');
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

          {!tryComposerOpen && (
            <div className="hero__mode-tabs" role="tablist" aria-label={t('hero.creationMode')}>
              <button
                type="button"
                role="tab"
                aria-selected={composerMode === 'standard'}
                className={`hero__mode-tab ${composerMode === 'standard' ? 'active' : ''}`}
                onClick={() => {
                  setComposerMode('standard');
                  setTryQueueError('');
                }}
              >
                <Image size={15} aria-hidden="true" />
                <span>{t('hero.standardMode')}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={composerMode === 'agent'}
                className={`hero__mode-tab ${composerMode === 'agent' ? 'active' : ''}`}
                onClick={() => {
                  setComposerMode('agent');
                  setTryQueueError('');
                }}
              >
                <Bot size={15} aria-hidden="true" />
                <span>{t('hero.agentMode')}</span>
              </button>
            </div>
          )}

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
              <MentionHighlight value={query} overlayRef={mentionOverlayRef} />
              <textarea
                ref={composerInputRef}
                className="hero__composer-input"
                rows={4}
                placeholder={retouchImagePreview || mentionPool.length > 0
                  ? t('hero.composerWithImagePlaceholder')
                  : t('hero.composerPlaceholder')}
                value={query}
                onChange={event => handleComposerQueryChange(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                onScroll={syncMentionOverlay}
                onClick={() => handleComposerQueryChange(query)}
                onKeyUp={() => handleComposerQueryChange(query)}
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

            {mentionPool.map(({ refIndex, prompt }) => (
              <div key={refIndex} className="hero__composer-mention">
                <img src={prompt.imageUrl} alt="" />
                <span className="hero__composer-mention-copy">
                  <span className="hero__composer-mention-label">
                    <AtSign size={12} />
                    @ref:{refIndex}
                  </span>
                  <strong>{prompt.category || t('hero.mentionSavedImage')}</strong>
                </span>
                <button
                  type="button"
                  className="hero__composer-mention-remove"
                  onClick={() => removeComposerMention(refIndex)}
                  aria-label={t('stylePanel.removeRef')}
                >
                  <X size={13} />
                </button>
              </div>
            ))}

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
                        <small>{option?.capability}</small>
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
          mentionPool={mentionPool}
          showMentionPicker={showMentionPicker}
          mentionQuery={mentionQuery}
          savedImagePrompts={savedImagePrompts}
          isQueueing={isQueueingTry}
          isRefining={isRefiningPrompt}
          submitLabel={composerSubmitLabel}
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
          onSyncMentionOverlay={syncMentionOverlay}
          onPaste={handlePaste}
          onDropFile={handleRetouchFile}
          onRemoveImage={removeRetouchImage}
        />
      )}

    </section>
  );
}
