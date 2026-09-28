import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, Upload, ArrowRight, RotateCcw, Check, AlertCircle, Ban, Coins, Image, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { trackAction } from '../../services/analytics';
import { normalizePromptCategory } from '../../utils/promptCategory';
import {
  DEFAULT_IMAGE_MODEL,
  getImageModelConfig,
  VISIBLE_IMAGE_MODEL_OPTIONS,
} from '../../config/imageModels';
import './Editor.css';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 150;
const MAX_POLL_ERRORS = 3;
const DEFAULT_SIZE = '1024x1024';
const DEFAULT_QUALITY = 'standard';

const SIZE_DEFS = [
  { value: '1024x1024', sizeKey: '1x1' },
  { value: '1792x1024', sizeKey: '16x9' },
  { value: '1024x1792', sizeKey: '9x16' },
  { value: '1536x1536', sizeKey: 'hd' },
];

export default function Editor() {
  const { t } = useTranslation();
  const { currentUser, addToHistory } = useApp();
  const navigate = useNavigate();

  // ── Step 1 state ────────────────────────────────────────────────────────
  const [step, setStep] = useState(1); // 1 or 2
  const [prompt1, setPrompt1] = useState('');
  const [negativePrompt1, setNegativePrompt1] = useState('');
  const [showNeg1, setShowNeg1] = useState(false);
  const [model1, setModel1] = useState(DEFAULT_IMAGE_MODEL);
  const [aspectRatio1, setAspectRatio1] = useState('1:1');
  const [imageSize1, setImageSize1] = useState('1K');
  const [size1, setSize1] = useState(DEFAULT_SIZE);
  const [quality1, setQuality1] = useState(DEFAULT_QUALITY);

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [prompt2, setPrompt2] = useState(''); // edit instruction
  const [negativePrompt2, setNegativePrompt2] = useState('');
  const [showNeg2, setShowNeg2] = useState(false);
  const [model2, setModel2] = useState(DEFAULT_IMAGE_MODEL);
  const [size2, setSize2] = useState(DEFAULT_SIZE);
  const [quality2, setQuality2] = useState(DEFAULT_QUALITY);

  // ── Shared generating state ──────────────────────────────────────────────
  const [status1, setStatus1] = useState('idle'); // idle | generating | success | error | credits
  const [result1, setResult1] = useState(null); // { imageUrl, jobId }
  const [status2, setStatus2] = useState('idle');
  const [result2, setResult2] = useState(null);
  const [errorMsg1, setErrorMsg1] = useState('');
  const [errorMsg2, setErrorMsg2] = useState('');
  const [creditsError1, setCreditsError1] = useState(false);
  const [creditsError2, setCreditsError2] = useState(false);
  const [pollCount1, setPollCount1] = useState(0);
  const [pollCount2, setPollCount2] = useState(0);
  const [pollErrors1, setPollErrors1] = useState(0);
  const [pollErrors2, setPollErrors2] = useState(0);
  const [jobStatus1, setJobStatus1] = useState('');
  const [jobStatus2, setJobStatus2] = useState('');

  const pollId1Ref = useRef(null);
  const pollId2Ref = useRef(null);
  const currentJobId1Ref = useRef(null);
  const currentJobId2Ref = useRef(null);
  const isGeneratingRef = useRef(false);
  const modelConfig1 = getImageModelConfig(model1);
  const modelConfig2 = getImageModelConfig(model2);
  const editorModelOptions2 = VISIBLE_IMAGE_MODEL_OPTIONS.filter(option => option.supportsEdit);

  // Sync locale defaults
  useEffect(() => {
    setSize1(prev => SIZE_DEFS.find(o => o.value === prev)?.value || DEFAULT_SIZE);
    setSize2(prev => SIZE_DEFS.find(o => o.value === prev)?.value || DEFAULT_SIZE);
  }, [t]);

  useEffect(() => {
    setQuality1(prev => (['standard', 'hd'].includes(prev) ? prev : DEFAULT_QUALITY));
    setQuality2(prev => (['standard', 'hd'].includes(prev) ? prev : DEFAULT_QUALITY));
  }, [t]);

  useEffect(() => {
    setModel1(prev => VISIBLE_IMAGE_MODEL_OPTIONS.some(o => o.value === prev) ? prev : DEFAULT_IMAGE_MODEL);
    setModel2(prev => editorModelOptions2.some(o => o.value === prev) ? prev : editorModelOptions2[0].value);
  }, []);
  useEffect(() => {
    const aspectRatios = modelConfig1.aspectRatios || ['1:1'];
    const imageSizes = modelConfig1.imageSizes || ['1K'];
    setAspectRatio1(prev => aspectRatios.includes(prev) ? prev : aspectRatios[0]);
    setImageSize1(prev => imageSizes.includes(prev) ? prev : imageSizes[0]);
  }, [model1]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup polls
  useEffect(() => {
    return () => {
      if (pollId1Ref.current) clearInterval(pollId1Ref.current);
      if (pollId2Ref.current) clearInterval(pollId2Ref.current);
    };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const sizeLabel = (val) => {
    const def = SIZE_DEFS.find(d => d.value === val);
    return def ? t(`generateModal.sizes.${def.sizeKey}`) : val;
  };

  const jobStatusText = (js) =>
    js === 'fast_running' ? t('editor.fastGenerating') :
    js === 'queued' ? t('editor.queued') :
    js === 'running' ? t('editor.generating') :
    js === 'succeeded' ? t('editor.succeeded') :
    js === 'failed' ? t('editor.failed') :
    js || t('editor.submitting');

  // ── Step 1 submit ───────────────────────────────────────────────────────
  const handleGenerate1 = useCallback(async () => {
    if (!currentUser) { navigate('/auth'); return; }
    if (isGeneratingRef.current) return;
    if (!prompt1.trim()) return;
    const inferredCategory = normalizePromptCategory({
      prompt: prompt1.trim(),
      tags: [],
      manualCategory: 'Generated',
    });

    isGeneratingRef.current = true;
    setStatus1('generating');
    setErrorMsg1('');
    setPollCount1(0);
    setPollErrors1(0);
    setJobStatus1('submitting');
    setCreditsError1(false);

    if (pollId1Ref.current) { clearInterval(pollId1Ref.current); pollId1Ref.current = null; }

    try {
      trackAction('act_editor_generate_start', { mode: 'text', category: inferredCategory, model: model1 });
      const jobPayload = {
        model: model1,
        size: size1,
        quality: quality1,
        generationOptions: modelConfig1.family === 'gemini'
          ? { aspectRatio: aspectRatio1, imageSize: imageSize1 }
          : {},
        mode: 'text',
        prompt: prompt1.trim(),
        negativePrompt: negativePrompt1.trim(),
        category: inferredCategory,
      };

      const jobResponse = await api.createGenJob(jobPayload);
      const id = jobResponse?.job?.id || jobResponse?.id;
      if (!id) throw new Error(t('editor.errorJobEnqueue'));
      setJobStatus1(jobResponse?.status || 'queued');
      currentJobId1Ref.current = id;

      const checkJob = async () => {
        setPollCount1(prev => {
          const next = prev + 1;
          if (next >= MAX_POLLS) {
            clearInterval(pollId1Ref.current); pollId1Ref.current = null;
            setErrorMsg1(t('editor.errorTimeout')); setStatus1('error');
          }
          return next;
        });

        try {
          const jobState = await api.getGenJob(id);
          const currentStatus = jobState?.status;
          setJobStatus1(currentStatus || '');
          setPollErrors1(0);

          if (currentStatus === 'succeeded' || currentStatus === 'completed') {
            clearInterval(pollId1Ref.current); pollId1Ref.current = null;
            const imageUrl = jobState?.resultImageUrl;
            if (!imageUrl) throw new Error(t('editor.errorNoResponse'));
            setResult1({ imageUrl, jobId: id });
            setStatus1('success');
            trackAction('act_editor_generate_success', { mode: 'text', category: inferredCategory, model: model1 });
            addToHistory({ id: `${id}-h`, imageUrl, prompt: prompt1.trim(), model: model1, mode: 'text', createdAt: new Date().toISOString() });
          } else if (['failed', 'error', 'cancelled'].includes(currentStatus)) {
            clearInterval(pollId1Ref.current); pollId1Ref.current = null;
            setErrorMsg1(jobState?.lastError || t('editor.errorJobFailed')); setStatus1('error');
            trackAction('act_editor_generate_fail', { mode: 'text', category: inferredCategory, model: model1, reason: 'job_failed' });
          }
        } catch (pollErr) {
          setPollErrors1(prev => {
            const next = prev + 1;
            if (next >= MAX_POLL_ERRORS) {
              clearInterval(pollId1Ref.current); pollId1Ref.current = null;
              setErrorMsg1(pollErr.message || t('editor.errorGeneric')); setStatus1('error');
            }
            return next;
          });
        }
      };

      checkJob();
      pollId1Ref.current = setInterval(checkJob, POLL_INTERVAL_MS);
    } catch (err) {
      isGeneratingRef.current = false;
      if (err.status === 401) {
        navigate('/auth', { state: { from: '/editor' } });
      } else if (err.status === 402) {
        setCreditsError1(true);
        setStatus1('credits');
      }
      else {
        setErrorMsg1(err.message || t('editor.errorGeneric')); setStatus1('error');
        trackAction('act_editor_generate_fail', { mode: 'text', category: inferredCategory, model: model1, reason: err.status === 402 ? 'credits' : 'submit_error' });
      }
    } finally {
      isGeneratingRef.current = false;
    }
  }, [currentUser, navigate, prompt1, negativePrompt1, model1, aspectRatio1, imageSize1, size1, quality1, t, addToHistory]);

  // ── Step 2 submit ────────────────────────────────────────────────────────
  const handleGenerate2 = useCallback(async () => {
    if (!currentUser) { navigate('/auth'); return; }
    if (!result1) return;
    if (isGeneratingRef.current) return;
    const effectivePrompt = prompt2.trim() || prompt1;
    const inferredCategory = normalizePromptCategory({
      prompt: effectivePrompt,
      tags: [],
      manualCategory: 'Editor',
    });

    isGeneratingRef.current = true;
    setStatus2('generating');
    setErrorMsg2('');
    setPollCount2(0);
    setPollErrors2(0);
    setJobStatus2('submitting');
    setCreditsError2(false);

    if (pollId2Ref.current) { clearInterval(pollId2Ref.current); pollId2Ref.current = null; }

    try {
      trackAction('act_editor_generate_start', { mode: 'edit', category: inferredCategory, model: model2 });
      const jobPayload = {
        model: model2,
        size: size2,
        quality: quality2,
        generationOptions: {},
        mode: 'edit',
        prompt: effectivePrompt,
        negativePrompt: negativePrompt2.trim(),
        referenceImageUrl: result1.imageUrl,
        editStrength: 0.6,
        category: inferredCategory,
      };

      const jobResponse = await api.createGenJob(jobPayload);
      const id = jobResponse?.job?.id || jobResponse?.id;
      if (!id) throw new Error(t('editor.errorJobEnqueue'));
      setJobStatus2(jobResponse?.status || 'queued');
      currentJobId2Ref.current = id;

      const checkJob = async () => {
        setPollCount2(prev => {
          const next = prev + 1;
          if (next >= MAX_POLLS) {
            clearInterval(pollId2Ref.current); pollId2Ref.current = null;
            setErrorMsg2(t('editor.errorTimeout')); setStatus2('error');
          }
          return next;
        });

        try {
          const jobState = await api.getGenJob(id);
          const currentStatus = jobState?.status;
          setJobStatus2(currentStatus || '');
          setPollErrors2(0);

          if (currentStatus === 'succeeded' || currentStatus === 'completed') {
            clearInterval(pollId2Ref.current); pollId2Ref.current = null;
            const imageUrl = jobState?.resultImageUrl;
            if (!imageUrl) throw new Error(t('editor.errorNoResponse'));
            setResult2({ imageUrl, jobId: id });
            setStatus2('success');
            trackAction('act_editor_generate_success', { mode: 'edit', category: inferredCategory, model: model2 });
            addToHistory({ id: `${id}-h`, imageUrl, prompt: effectivePrompt, model: model2, mode: 'edit', createdAt: new Date().toISOString() });
          } else if (['failed', 'error', 'cancelled'].includes(currentStatus)) {
            clearInterval(pollId2Ref.current); pollId2Ref.current = null;
            setErrorMsg2(jobState?.lastError || t('editor.errorJobFailed')); setStatus2('error');
            trackAction('act_editor_generate_fail', { mode: 'edit', category: inferredCategory, model: model2, reason: 'job_failed' });
          }
        } catch (pollErr) {
          setPollErrors2(prev => {
            const next = prev + 1;
            if (next >= MAX_POLL_ERRORS) {
              clearInterval(pollId2Ref.current); pollId2Ref.current = null;
              setErrorMsg2(pollErr.message || t('editor.errorGeneric')); setStatus2('error');
            }
            return next;
          });
        }
      };

      checkJob();
      pollId2Ref.current = setInterval(checkJob, POLL_INTERVAL_MS);
    } catch (err) {
      isGeneratingRef.current = false;
      if (err.status === 401) {
        navigate('/auth', { state: { from: '/editor' } });
      } else if (err.status === 402) {
        setCreditsError2(true);
        setStatus2('credits');
      }
      else {
        setErrorMsg2(err.message || t('editor.errorGeneric')); setStatus2('error');
        trackAction('act_editor_generate_fail', { mode: 'edit', category: inferredCategory, model: model2, reason: err.status === 402 ? 'credits' : 'submit_error' });
      }
    } finally {
      isGeneratingRef.current = false;
    }
  }, [currentUser, navigate, result1, prompt1, prompt2, negativePrompt2, model2, size2, quality2, t, addToHistory]);

  // ── Cancel job ───────────────────────────────────────────────────────────
  const handleCancel = async (stepNum) => {
    if (stepNum === 1 && currentJobId1Ref.current) {
      try { await api.cancelGenJob(currentJobId1Ref.current); } catch {}
      if (pollId1Ref.current) { clearInterval(pollId1Ref.current); pollId1Ref.current = null; }
      setStatus1('idle'); setErrorMsg1(''); currentJobId1Ref.current = null;
    } else if (stepNum === 2 && currentJobId2Ref.current) {
      try { await api.cancelGenJob(currentJobId2Ref.current); } catch {}
      if (pollId2Ref.current) { clearInterval(pollId2Ref.current); pollId2Ref.current = null; }
      setStatus2('idle'); setErrorMsg2(''); currentJobId2Ref.current = null;
    }
  };

  // ── Reset step 1 to redo ─────────────────────────────────────────────────
  const handleRedo1 = () => {
    setStatus1('idle'); setResult1(null); setErrorMsg1(''); setCreditsError1(false);
    setPollCount1(0); setPollErrors1(0);
  };

  const isGenerating1 = status1 === 'generating';
  const isGenerating2 = status2 === 'generating';

  return (
    <div className="editor-page">
      <div className="editor-page__inner">
        {/* Page header */}
        <div className="editor-page__header">
          <div className="editor-page__badge">
            <Sparkles size={14} />
            {t('editor.badge')}
          </div>
          <h1 className="editor-page__title">{t('editor.title')}</h1>
          <p className="editor-page__subtitle">{t('editor.subtitle')}</p>
        </div>

        {/* Step indicator */}
        <div className="editor-page__steps">
          <button
            className={`editor-step-btn ${step === 1 ? 'active' : ''} ${status1 === 'success' ? 'done' : ''}`}
            onClick={() => step > 1 && setStep(1)}
            disabled={status1 === 'generating'}
          >
            <span className="editor-step-btn__num">
              {status1 === 'success' ? <Check size={14} /> : '1'}
            </span>
            <span className="editor-step-btn__label">{t('editor.step1Label')}</span>
          </button>
          <div className={`editor-steps__divider ${step === 2 ? 'active' : ''}`}>
            <ArrowRight size={14} />
          </div>
          <button
            className={`editor-step-btn ${step === 2 ? 'active' : ''} ${status2 === 'success' ? 'done' : ''}`}
            onClick={() => setStep(2)}
            disabled={!result1 || status2 === 'generating'}
          >
            <span className="editor-step-btn__num">
              {status2 === 'success' ? <Check size={14} /> : '2'}
            </span>
            <span className="editor-step-btn__label">{t('editor.step2Label')}</span>
          </button>
        </div>

        {/* ── STEP 1 ──────────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="editor-step"
            >
              {/* Step 1 header */}
              <div className="editor-step__header">
                <span className="editor-step__num">01</span>
                <div>
                  <h2 className="editor-step__title">{t('editor.step1Title')}</h2>
                  <p className="editor-step__desc">{t('editor.step1Desc')}</p>
                </div>
              </div>

              {/* Step 1 success result */}
              {status1 === 'success' && result1 ? (
                <div className="editor-step__result">
                  <div className="editor-step__result-images">
                    <div className="editor-step__result-card">
                      <img src={result1.imageUrl} alt={t('editor.step1ResultAlt')} className="editor-step__result-img" />
                      <div className="editor-step__result-badge">{t('editor.step1Badge')}</div>
                    </div>
                  </div>
                  <div className="editor-step__result-actions">
                    <a
                      href={result1.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="editor-btn editor-btn--ghost"
                    >
                      <Download size={15} />
                      {t('editor.download')}
                    </a>
                    <button className="editor-btn editor-btn--ghost" onClick={handleRedo1}>
                      <RotateCcw size={15} />
                      {t('editor.redo')}
                    </button>
                    <button
                      className="editor-btn editor-btn--primary"
                      onClick={() => setStep(2)}
                      disabled={isGenerating2}
                    >
                      {t('editor.step1Continue')}
                      <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 1 form */
                <div className="editor-step__form">
                  {/* Prompt input */}
                  <div className="editor-field">
                    <label className="editor-label">{t('editor.promptLabel')}</label>
                    <textarea
                      className="editor-textarea"
                      rows={5}
                      value={prompt1}
                      onChange={e => setPrompt1(e.target.value)}
                      placeholder={t('editor.promptPlaceholder')}
                      disabled={isGenerating1}
                    />
                  </div>

                  {/* Model + Size + Quality row */}
                  <div className="editor-row">
                    <div className="editor-select-group">
                      <label className="editor-label">{t('generateModal.model')}</label>
                      <div className="editor-select-wrap">
                        <select
                          className="editor-select"
                          value={model1}
                          onChange={e => setModel1(e.target.value)}
                          disabled={isGenerating1}
                        >
                          {VISIBLE_IMAGE_MODEL_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label} · {option.capability}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {modelConfig1.family === 'gemini' ? (
                      <>
                        <div className="editor-select-group">
                          <label className="editor-label">{t('generateModal.aspectRatio')}</label>
                          <div className="editor-select-wrap">
                            <select
                              className="editor-select"
                              value={aspectRatio1}
                              onChange={e => setAspectRatio1(e.target.value)}
                              disabled={isGenerating1}
                            >
                              {(modelConfig1.aspectRatios || []).map(value => (
                                <option key={value} value={value}>{value}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="editor-select-group">
                          <label className="editor-label">{t('generateModal.imageSize')}</label>
                          <div className="editor-select-wrap">
                            <select
                              className="editor-select"
                              value={imageSize1}
                              onChange={e => setImageSize1(e.target.value)}
                              disabled={isGenerating1}
                            >
                              {(modelConfig1.imageSizes || []).map(value => (
                                <option key={value} value={value}>{value}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="editor-select-group">
                          <label className="editor-label">{t('editor.size')}</label>
                          <div className="editor-select-wrap">
                            <select
                              className="editor-select"
                              value={size1}
                              onChange={e => setSize1(e.target.value)}
                              disabled={isGenerating1}
                            >
                              {SIZE_DEFS.map(def => (
                                <option key={def.value} value={def.value}>{t(`generateModal.sizes.${def.sizeKey}`)}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="editor-select-group">
                          <label className="editor-label">{t('editor.quality')}</label>
                          <div className="editor-select-wrap">
                            <select
                              className="editor-select"
                              value={quality1}
                              onChange={e => setQuality1(e.target.value)}
                              disabled={isGenerating1}
                            >
                              <option value="standard">{t('generateModal.qualityStandard')}</option>
                              <option value="hd">{t('generateModal.qualityHD')}</option>
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Negative prompt toggle */}
                  <div className="editor-field">
                    <button
                      className="editor-negative-toggle"
                      onClick={() => setShowNeg1(v => !v)}
                      disabled={isGenerating1}
                    >
                      <span>{t('generateModal.negativePrompt')}</span>
                    </button>
                    {showNeg1 && (
                      <textarea
                        className="editor-textarea"
                        rows={2}
                        value={negativePrompt1}
                        onChange={e => setNegativePrompt1(e.target.value)}
                        placeholder={t('generateModal.negativePromptPlaceholder')}
                        disabled={isGenerating1}
                        style={{ marginTop: '10px' }}
                      />
                    )}
                  </div>

                  {/* Credits error */}
                  {creditsError1 && (
                    <div className="editor-credits-error">
                      <Coins size={18} />
                      <span>{t('editor.creditsAlert')}</span>
                      <button onClick={() => navigate('/balance')}>{t('editor.topUp')}</button>
                    </div>
                  )}

                  {/* Generic error */}
                  {!creditsError1 && errorMsg1 && (
                    <div className="editor-error">
                      <AlertCircle size={14} />
                      <span>{errorMsg1}</span>
                    </div>
                  )}

                  {/* Generate / Cancel button */}
                  {isGenerating1 ? (
                    <div className="editor-generating-row">
                      <div className="editor-generating-label">
                        <div className="editor-spinner" />
                        <span>{t('editor.generating')}</span>
                        {pollCount1 > 0 && (
                          <span className="editor-poll-count">{t('editor.polling', { n: pollCount1 })}</span>
                        )}
                      </div>
                      <div className="editor-job-meta">
                        <span className="editor-job-status">{jobStatusText(jobStatus1)}</span>
                      </div>
                      <button className="editor-cancel-btn" onClick={() => handleCancel(1)}>
                        <Ban size={13} />
                        {t('generateModal.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="editor-submit-btn"
                      onClick={handleGenerate1}
                      disabled={isGenerating1 || !prompt1.trim()}
                    >
                      <Sparkles size={16} />
                      {t('editor.generate')}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ── STEP 2 ──────────────────────────────────────────────────────── */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="editor-step"
            >
              {/* Step 2 header */}
              <div className="editor-step__header">
                <span className="editor-step__num">02</span>
                <div>
                  <h2 className="editor-step__title">{t('editor.step2Title')}</h2>
                  <p className="editor-step__desc">{t('editor.step2Desc')}</p>
                </div>
              </div>

              {/* Reference image from step 1 */}
              {result1 && (
                <div className="editor-step__ref">
                  <div className="editor-ref-label">
                    <Image size={12} />
                    {t('editor.referenceImage')}
                  </div>
                  <img src={result1.imageUrl} alt={t('editor.refAlt')} className="editor-step__ref-img" />
                </div>
              )}

              {/* Step 2 success result */}
              {status2 === 'success' && result2 ? (
                <div className="editor-step__result">
                  <div className="editor-step__result-images">
                    <div className="editor-step__result-card">
                      <img src={result1.imageUrl} alt={t('editor.refAlt')} className="editor-step__result-img editor-step__result-img--small" />
                      <div className="editor-step__result-badge">{t('editor.original')}</div>
                    </div>
                    <div className="editor-step__result-arrow">
                      <ArrowRight size={18} />
                    </div>
                    <div className="editor-step__result-card">
                      <img src={result2.imageUrl} alt={t('editor.step2ResultAlt')} className="editor-step__result-img" />
                      <div className="editor-step__result-badge editor-step__result-badge--accent">{t('editor.edited')}</div>
                    </div>
                  </div>
                  <div className="editor-step__result-actions">
                    <a
                      href={result2.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="editor-btn editor-btn--ghost"
                    >
                      <Download size={15} />
                      {t('editor.downloadEdited')}
                    </a>
                    <button
                      className="editor-btn editor-btn--ghost"
                      onClick={() => { setStatus2('idle'); setResult2(null); setErrorMsg2(''); setPollCount2(0); setPollErrors2(0); }}
                    >
                      <RotateCcw size={15} />
                      {t('editor.retryEdit')}
                    </button>
                    <button
                      className="editor-btn editor-btn--primary"
                      onClick={() => {
                        setResult1(result2);
                        setResult2(null);
                        setStatus2('idle');
                        setPrompt2('');
                      }}
                    >
                      <ArrowRight size={15} />
                      {t('editor.useAsNewBase')}
                    </button>
                  </div>
                </div>
              ) : (
                /* Step 2 form */
                <div className="editor-step__form">
                  {/* Edit instruction */}
                  <div className="editor-field">
                    <label className="editor-label">{t('editor.editInstructionLabel')}</label>
                    <textarea
                      className="editor-textarea"
                      rows={4}
                      value={prompt2}
                      onChange={e => setPrompt2(e.target.value)}
                      placeholder={t('editor.editInstructionPlaceholder')}
                      disabled={isGenerating2}
                    />
                  </div>

                  {/* Model + Size + Quality */}
                  <div className="editor-row">
                    <div className="editor-select-group">
                      <label className="editor-label">{t('generateModal.model')}</label>
                      <div className="editor-select-wrap">
                        <select
                          className="editor-select"
                          value={model2}
                          onChange={e => setModel2(e.target.value)}
                          disabled={isGenerating2}
                        >
                          {editorModelOptions2.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="editor-select-group">
                      <label className="editor-label">{t('editor.size')}</label>
                      <div className="editor-select-wrap">
                        <select
                          className="editor-select"
                          value={size2}
                          onChange={e => setSize2(e.target.value)}
                          disabled={isGenerating2}
                        >
                          {SIZE_DEFS.map(def => (
                            <option key={def.value} value={def.value}>{t(`generateModal.sizes.${def.sizeKey}`)}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="editor-select-group">
                      <label className="editor-label">{t('editor.quality')}</label>
                      <div className="editor-select-wrap">
                        <select
                          className="editor-select"
                          value={quality2}
                          onChange={e => setQuality2(e.target.value)}
                          disabled={isGenerating2}
                        >
                          <option value="standard">{t('generateModal.qualityStandard')}</option>
                          <option value="hd">{t('generateModal.qualityHD')}</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Negative prompt toggle */}
                  <div className="editor-field">
                    <button
                      className="editor-negative-toggle"
                      onClick={() => setShowNeg2(v => !v)}
                      disabled={isGenerating2}
                    >
                      <span>{t('generateModal.negativePrompt')}</span>
                    </button>
                    {showNeg2 && (
                      <textarea
                        className="editor-textarea"
                        rows={2}
                        value={negativePrompt2}
                        onChange={e => setNegativePrompt2(e.target.value)}
                        placeholder={t('generateModal.negativePromptPlaceholder')}
                        disabled={isGenerating2}
                        style={{ marginTop: '10px' }}
                      />
                    )}
                  </div>

                  {/* Credits error */}
                  {creditsError2 && (
                    <div className="editor-credits-error">
                      <Coins size={18} />
                      <span>{t('editor.creditsAlert')}</span>
                      <button onClick={() => navigate('/balance')}>{t('editor.topUp')}</button>
                    </div>
                  )}

                  {/* Generic error */}
                  {!creditsError2 && errorMsg2 && (
                    <div className="editor-error">
                      <AlertCircle size={14} />
                      <span>{errorMsg2}</span>
                    </div>
                  )}

                  {/* Generate / Cancel button */}
                  {isGenerating2 ? (
                    <div className="editor-generating-row">
                      <div className="editor-generating-label">
                        <div className="editor-spinner" />
                        <span>{t('editor.generating')}</span>
                        {pollCount2 > 0 && (
                          <span className="editor-poll-count">{t('editor.polling', { n: pollCount2 })}</span>
                        )}
                      </div>
                      <div className="editor-job-meta">
                        <span className="editor-job-status">{jobStatusText(jobStatus2)}</span>
                      </div>
                      <button className="editor-cancel-btn" onClick={() => handleCancel(2)}>
                        <Ban size={13} />
                        {t('generateModal.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="editor-submit-btn"
                      onClick={handleGenerate2}
                      disabled={isGenerating2}
                    >
                      <Sparkles size={16} />
                      {t('editor.generateEdited')}
                    </button>
                  )}
                </div>
              )}

              {/* Back to step 1 */}
              <button className="editor-back-btn" onClick={() => setStep(1)}>
                ← {t('editor.backToStep1')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
