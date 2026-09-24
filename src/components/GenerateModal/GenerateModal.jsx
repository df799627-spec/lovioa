import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Sparkles, AlertCircle, Download, RotateCcw, ChevronDown, Ban, Coins, Image } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { trackAction } from '../../services/analytics';
import { normalizePromptCategory } from '../../utils/promptCategory';
import { DEFAULT_IMAGE_MODEL, getImageModelConfig, IMAGE_MODEL_OPTIONS } from '../../config/imageModels';
import './GenerateModal.css';
import ShareButton from '../ShareButton/ShareButton';

const SIZE_DEFS = [
  { value: '1024x1024', sizeKey: '1x1' },
  { value: '1792x1024', sizeKey: '16x9' },
  { value: '1024x1792', sizeKey: '9x16' },
  { value: '1536x1536', sizeKey: 'hd' },
];
// QUALITY_OPTIONS is built inside the component after i18n is ready

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 150;
const MAX_POLL_ERRORS = 3;

const DEFAULT_SIZE = import.meta.env.VITE_OPENAI_IMAGE_SIZE || '1024x1024';
const DEFAULT_QUALITY = import.meta.env.VITE_OPENAI_IMAGE_QUALITY || 'standard';

export default function GenerateModal({
  initialPrompt = '',
  initialMode = 'text',
  initialImage = null,
  initialReferenceImageUrl = '',
  initialModel = DEFAULT_IMAGE_MODEL,
  initialInstruction = '',
  initialStrength = null,
  initialAspectRatio = '1:1',
  initialImageSize = '1K',
  autoCloseOnSuccess = false,
  onSuccess,
  onClose,
}) {
  const { t } = useTranslation();
  const { addToHistory } = useApp();
  const SIZE_OPTIONS = useMemo(() =>
    SIZE_DEFS.map(def => ({
      value: def.value,
      label: t(`generateModal.sizes.${def.sizeKey}`),
    })), [t]);

  const QUALITY_OPTIONS = useMemo(() => [
    { value: 'standard', label: t('generateModal.qualityStandard') },
    { value: 'hd', label: t('generateModal.qualityHD') },
  ], [t]);

  const [selectedModel, setSelectedModel] = useState(() =>
    IMAGE_MODEL_OPTIONS.some(option => option.value === initialModel)
      ? initialModel
      : DEFAULT_IMAGE_MODEL
  );
  const [selectedAspectRatio, setSelectedAspectRatio] = useState(initialAspectRatio === 'auto' ? '1:1' : initialAspectRatio);
  const [selectedImageSize, setSelectedImageSize] = useState(initialImageSize);
  const [selectedSize, setSelectedSize] = useState(
    SIZE_DEFS.find(o => o.value === DEFAULT_SIZE)?.value || '1024x1024'
  );
  const [selectedQuality, setSelectedQuality] = useState(
    QUALITY_OPTIONS.find(o => o.value === DEFAULT_QUALITY)?.value || 'standard'
  );
  const [mode, setMode] = useState(initialMode);
  const [editImageFile, setEditImageFile] = useState(initialImage);
  const [editReferenceImageUrl, setEditReferenceImageUrl] = useState(initialReferenceImageUrl);
  const [editImagePreview, setEditImagePreview] = useState(initialReferenceImageUrl);
  const [editPrompt, setEditPrompt] = useState(initialInstruction || t('generateModal.retouchPlaceholder'));
  const [negativePrompt, setNegativePrompt] = useState('');
  const [showNegative, setShowNegative] = useState(false);
  const [selectedStrength, setSelectedStrength] = useState(initialStrength ?? 0.6);
  const [status, setStatus] = useState('idle');
  const [generatedImage, setGeneratedImage] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [creditsError, setCreditsError] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [pollErrors, setPollErrors] = useState(0);
  const [jobStatus, setJobStatus] = useState('');
  const [jobId, setJobId] = useState(null);
  const navigate = useNavigate();
  const pollIdRef = useRef(null);
  const currentJobIdRef = useRef(null);
  const fileInputRef = useRef(null);
  const selectedModelConfig = getImageModelConfig(selectedModel);
  const isGeminiModel = selectedModelConfig.family === 'gemini';
  const availableModelOptions = mode === 'edit'
    ? IMAGE_MODEL_OPTIONS.filter(option => option.supportsEdit)
    : IMAGE_MODEL_OPTIONS;

  // Sync selected values when locale/options change (avoids stale default on first render)
  useEffect(() => {
    setSelectedSize(prev => SIZE_DEFS.find(o => o.value === prev)?.value || '1024x1024');
  }, [t]);
  useEffect(() => {
    setSelectedQuality(prev => QUALITY_OPTIONS.find(o => o.value === prev)?.value || 'standard');
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSelectedModel(prev => availableModelOptions.some(o => o.value === prev) ? prev : availableModelOptions[0].value);
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const config = getImageModelConfig(selectedModel);
    const aspectRatios = config.aspectRatios || ['1:1'];
    const imageSizes = config.imageSizes || ['1K'];
    setSelectedAspectRatio(prev => aspectRatios.includes(prev) ? prev : aspectRatios[0]);
    setSelectedImageSize(prev => imageSizes.includes(prev) ? prev : imageSizes[0]);
  }, [selectedModel]);

  useEffect(() => {
    if (initialAspectRatio && initialAspectRatio !== 'auto') {
      setSelectedAspectRatio(initialAspectRatio);
    }
    if (initialImageSize) setSelectedImageSize(initialImageSize);
  }, [initialAspectRatio, initialImageSize]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIdRef.current) {
        clearInterval(pollIdRef.current);
        pollIdRef.current = null;
      }
    };
  }, []);

  // Auto-close on success when autoCloseOnSuccess is enabled
  useEffect(() => {
    if (autoCloseOnSuccess && status === 'success' && generatedImage) {
      const timer = setTimeout(() => {
        onSuccess?.(generatedImage);
        onClose?.();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, generatedImage, autoCloseOnSuccess, onSuccess, onClose]);

  useEffect(() => {
    if (initialImage) {
      const url = URL.createObjectURL(initialImage);
      setEditImageFile(initialImage);
      setEditReferenceImageUrl('');
      setEditImagePreview(url);
    } else if (initialReferenceImageUrl) {
      setEditImageFile(null);
      setEditReferenceImageUrl(initialReferenceImageUrl);
      setEditImagePreview(initialReferenceImageUrl);
    }
  }, [initialImage, initialReferenceImageUrl]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setEditImageFile(null);
      setEditImagePreview('');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setErrorMsg(t('generateModal.errorFileType'));
      return;
    }
    setEditImageFile(file);
    setEditReferenceImageUrl('');
    setEditImagePreview(URL.createObjectURL(file));
  };

  const handleCancel = async () => {
    if (!currentJobIdRef.current) return;
    try {
      await api.cancelGenJob(currentJobIdRef.current);
    } catch {}
    if (pollIdRef.current) {
      clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }
    setStatus('idle');
    setErrorMsg('');
    setJobId(null);
    setCreditsError(false);
    currentJobIdRef.current = null;
  };

  const handleGenerate = async () => {
    if (mode === 'edit' && !editImageFile && !editReferenceImageUrl) {
      setErrorMsg(t('generateModal.errorImageRequired'));
      return;
    }

    const effectivePrompt = mode === 'text' ? initialPrompt : editPrompt.trim() || initialPrompt;
    const inferredCategory = normalizePromptCategory({
      prompt: effectivePrompt,
      tags: [],
      manualCategory: 'Generated',
    });

    setStatus('generating');
    setErrorMsg('');
    setPollCount(0);
    setPollErrors(0);
    setJobStatus('submitting');
    setJobId(null);
    trackAction('act_generate_start', { model: selectedModel, mode, category: inferredCategory });

    if (pollIdRef.current) {
      clearInterval(pollIdRef.current);
      pollIdRef.current = null;
    }

    try {
      const jobPayload = {
        model: selectedModel,
        size: selectedSize,
        quality: selectedQuality,
        generationOptions: isGeminiModel
          ? { aspectRatio: selectedAspectRatio, imageSize: selectedImageSize }
          : {},
        mode,
        prompt: effectivePrompt,
        negativePrompt: negativePrompt.trim(),
        category: inferredCategory,
      };

      if (mode === 'edit') {
        jobPayload.editStrength = parseFloat(selectedStrength);
        if (editImageFile) {
          const { url } = await api.uploadImage(editImageFile);
          jobPayload.referenceImageUrl = url;
        } else if (editReferenceImageUrl) {
          jobPayload.referenceImageUrl = editReferenceImageUrl;
        }
      }

      const jobResponse = await api.createGenJob(jobPayload);
      const id = jobResponse?.job?.id || jobResponse?.id;
      if (!id) throw new Error(t('generateModal.errorJobEnqueue'));
      setJobId(id);
      currentJobIdRef.current = id;
      setJobStatus(jobResponse?.status || 'queued');

      const checkJob = async () => {
        setPollCount(prev => {
          const nextPoll = prev + 1;
          if (nextPoll >= MAX_POLLS) {
            clearInterval(pollIdRef.current);
            pollIdRef.current = null;
            setErrorMsg(t('generateModal.errorTimeout'));
            setStatus('error');
          }
          return nextPoll;
        });

        try {
          const jobState = await api.getGenJob(id);
          const currentStatus = jobState?.status;
          setJobStatus(currentStatus || '');
          setPollErrors(0);

          if (currentStatus === 'succeeded' || currentStatus === 'completed') {
            clearInterval(pollIdRef.current);
            pollIdRef.current = null;
            const imageUrl = jobState?.resultImageUrl;
            if (!imageUrl) throw new Error(t('generateModal.errorNoResponse'));
            setGeneratedImage(imageUrl);
            setStatus('success');
            trackAction('act_generate_success', { model: selectedModel, mode, category: inferredCategory });
            addToHistory({
              id: `${id}-h`,
              imageUrl,
              prompt: effectivePrompt,
              model: selectedModel,
              mode,
              createdAt: new Date().toISOString(),
            });
          } else if (currentStatus === 'failed' || currentStatus === 'error' || currentStatus === 'cancelled') {
            clearInterval(pollIdRef.current);
            pollIdRef.current = null;
            const errMsg = jobState?.lastError || jobState?.error || t('generateModal.errorJobFailed');
            setErrorMsg(errMsg);
            setStatus('error');
            trackAction('act_generate_fail', { model: selectedModel, mode, reason: 'job_failed', category: inferredCategory });
          }
        } catch (pollErr) {
          console.warn('[gen] poll error:', pollErr.message);
          setPollErrors(prev => {
            const nextErrs = prev + 1;
            if (nextErrs >= MAX_POLL_ERRORS) {
              clearInterval(pollIdRef.current);
              pollIdRef.current = null;
              setErrorMsg(pollErr.message || t('generateModal.errorGeneric'));
              setStatus('error');
            }
            return nextErrs;
          });
        }
      };

      // Run once immediately so user sees quick state feedback
      checkJob();
      pollIdRef.current = setInterval(checkJob, POLL_INTERVAL_MS);
    } catch (err) {
      if (err.status === 401) {
        setStatus('idle');
        navigate('/auth', { state: { from: window.location.pathname } });
      } else if (err.status === 402) {
        setCreditsError(true);
        setStatus('credits');
      } else {
        setErrorMsg(err.message || t('generateModal.errorGeneric'));
        setStatus('error');
        trackAction('act_generate_fail', {
          model: selectedModel,
          mode,
          reason: err.status === 402 ? 'credits' : 'submit_error',
          category: inferredCategory,
        });
      }
    }
  };

  const isLoading = status === 'generating';
  const jobStatusText = (
    jobStatus === 'fast_running' ? 'Fast generating...' :
    jobStatus === 'queued' ? 'Queued...' :
    jobStatus === 'running' ? 'Generating...' :
    jobStatus === 'succeeded' ? 'Succeeded' :
    jobStatus === 'failed' ? 'Failed' :
    jobStatus || 'Submitting...'
  );

  return (
    <div className="generate-modal-backdrop" onClick={onClose}>
      <div className="generate-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="generate-modal__header">
          <div className="generate-modal__title">
            <Sparkles size={18} />
            {t('generateModal.title')}
          </div>
          <button className="generate-modal__close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Success result */}
        {status === 'success' ? (
          <div className="generate-modal__result">
            <div className="generate-modal__result-image-wrap">
              <img src={generatedImage} alt="Generated" className="generate-modal__result-image" />
              {editImagePreview && (
                <div className="generate-modal__result-overlay">
                  <img src={editImagePreview} alt="Reference" className="generate-modal__result-ref" />
                </div>
              )}
              <div className="generate-modal__result-share">
                <ShareButton url={`/history`} title="Check out this AI-generated image on Lovioa" />
              </div>
            </div>
            <div className="generate-modal__result-actions">
              <a
                href={generatedImage}
                target="_blank"
                rel="noopener noreferrer"
                className="generate-modal__result-btn generate-modal__result-btn--primary"
              >
                <Download size={15} />
                {t('generateModal.viewImage')}
              </a>
              <button
                className="generate-modal__result-btn generate-modal__result-btn--secondary"
                onClick={() => { setStatus('idle'); setGeneratedImage(null); setCreditsError(false); }}
              >
                <RotateCcw size={15} />
                {t('generateModal.retry')}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Prompt display */}
            <div className="generate-modal__prompt">
              <span className="generate-modal__prompt-label">{t('generateModal.promptLabel')}</span>
              <p className="generate-modal__prompt-text">{initialPrompt}</p>
            </div>

            {/* Mode switch */}
            <div className="generate-modal__field">
              <label className="generate-modal__label">{t('generateModal.mode')}</label>
              <div className="generate-modal__mode-switch">
                <button
                  className={`generate-modal__mode-btn ${mode === 'text' ? 'active' : ''}`}
                  onClick={() => setMode('text')}
                  disabled={isLoading}
                >
                  {t('generateModal.modeText')}
                </button>
                <button
                  className={`generate-modal__mode-btn ${mode === 'edit' ? 'active' : ''}`}
                  onClick={() => setMode('edit')}
                  disabled={isLoading}
                >
                  {t('generateModal.modeEdit')}
                </button>
              </div>
            </div>

            {/* Reference image — only in edit mode */}
            {mode === 'edit' && (
              <div className="generate-modal__field">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                  disabled={isLoading}
                />
                <button
                  className="generate-modal__file-trigger"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  type="button"
                >
                  <Image size={15} />
                  {t('generateModal.uploadPhoto')}
                </button>
                {editImagePreview && (
                  <div className="generate-modal__edit-preview-wrap">
                    <img src={editImagePreview} alt="Reference" className="generate-modal__edit-preview" />
                  </div>
                )}
                <label className="generate-modal__label" style={{ marginTop: '12px' }}>{t('generateModal.retouchInstruction')}</label>
                <textarea
                  className="generate-modal__textarea"
                  rows={4}
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)}
                  disabled={isLoading}
                  placeholder={t('generateModal.retouchPlaceholder')}
                />
              </div>
            )}

            {/* Negative prompt — expandable */}
            <div className="generate-modal__field">
              <button
                className="generate-modal__negative-toggle"
                onClick={() => setShowNegative(v => !v)}
                disabled={isLoading}
              >
                <span>{t('generateModal.negativePrompt')}</span>
                <ChevronDown
                  size={14}
                  style={{ transform: showNegative ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                />
              </button>
              {showNegative && (
                <div className="generate-modal__negative-wrap">
                  <textarea
                    className="generate-modal__textarea"
                    rows={3}
                    value={negativePrompt}
                    onChange={e => setNegativePrompt(e.target.value)}
                    disabled={isLoading}
                    placeholder={t('generateModal.negativePromptPlaceholder')}
                  />
                </div>
              )}
            </div>

            {/* Model + Size + Quality row */}
            <div className="generate-modal__field generate-modal__field--row">
              <div className="generate-modal__select-group">
                <label className="generate-modal__label">{t('generateModal.model')}</label>
                <div className="generate-modal__select-wrap">
                  <select
                    className="generate-modal__select"
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                    disabled={isLoading}
                  >
                    {availableModelOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="generate-modal__select-icon" />
                </div>
              </div>

              {isGeminiModel ? (
                <>
                  <div className="generate-modal__select-group">
                    <label className="generate-modal__label">{t('generateModal.aspectRatio')}</label>
                    <div className="generate-modal__select-wrap">
                      <select
                        className="generate-modal__select"
                        value={selectedAspectRatio}
                        onChange={e => setSelectedAspectRatio(e.target.value)}
                        disabled={isLoading}
                      >
                        {(selectedModelConfig.aspectRatios || []).map(value => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="generate-modal__select-icon" />
                    </div>
                  </div>
                  <div className="generate-modal__select-group">
                    <label className="generate-modal__label">{t('generateModal.imageSize')}</label>
                    <div className="generate-modal__select-wrap">
                      <select
                        className="generate-modal__select"
                        value={selectedImageSize}
                        onChange={e => setSelectedImageSize(e.target.value)}
                        disabled={isLoading}
                      >
                        {(selectedModelConfig.imageSizes || []).map(value => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="generate-modal__select-icon" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="generate-modal__select-group">
                    <label className="generate-modal__label">{t('generateModal.size')}</label>
                    <div className="generate-modal__select-wrap">
                      <select
                        className="generate-modal__select"
                        value={selectedSize}
                        onChange={e => setSelectedSize(e.target.value)}
                        disabled={isLoading}
                      >
                        {SIZE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="generate-modal__select-icon" />
                    </div>
                  </div>
                  <div className="generate-modal__select-group">
                    <label className="generate-modal__label">{t('generateModal.quality')}</label>
                    <div className="generate-modal__select-wrap">
                      <select
                        className="generate-modal__select"
                        value={selectedQuality}
                        onChange={e => setSelectedQuality(e.target.value)}
                        disabled={isLoading}
                      >
                        {QUALITY_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={12} className="generate-modal__select-icon" />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Credits error */}
            {creditsError && (
              <div className="generate-modal__credits-error">
                <div className="generate-modal__credits-error-icon">
                  <Coins size={20} />
                </div>
                <div className="generate-modal__credits-error-text">
                  <strong>{t('generateModal.creditsAlert')}</strong>
                  <p>{t('generateModal.creditsAlertDesc')}</p>
                </div>
                <button
                  className="generate-modal__credits-error-btn"
                  onClick={() => navigate('/balance')}
                >
                  {t('generateModal.topUp')}
                </button>
              </div>
            )}

            {/* Generic error */}
            {!creditsError && errorMsg && (
              <div className="generate-modal__error">
                <AlertCircle size={14} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Generate button */}
            {isLoading ? (
              <div className="generate-modal__generating-row">
                <div className="generate-modal__generating-label">
                  <div className="generate-modal__spinner" />
                  <span>{t('generateModal.generating')}</span>
                  {pollCount > 0 && (
                    <span className="generate-modal__poll-count">
                      {t('generateModal.polling')}
                    </span>
                  )}
                </div>
                <div className="generate-modal__job-meta">
                  <span className="generate-modal__job-status">{jobStatusText}</span>
                  {jobId && <span className="generate-modal__job-id">#{jobId.slice(0, 8)}</span>}
                </div>
                <button
                  className="generate-modal__cancel-btn"
                  onClick={handleCancel}
                  title={t('generateModal.cancel')}
                >
                  <Ban size={14} />
                  {t('generateModal.cancel')}
                </button>
              </div>
            ) : (
              <button
                className="generate-modal__submit"
                onClick={handleGenerate}
                disabled={isLoading}
              >
                <Sparkles size={16} />
                {t('generateModal.generateBtn')}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
