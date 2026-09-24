import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Image, Tag, Sparkles, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { trackAction } from '../../services/analytics';
import { inferPromptTags, normalizePromptCategory } from '../../utils/promptCategory';
import './Upload.css';

const STEP_KEYS = [
  'upload.steps_0', 'upload.steps_1', 'upload.steps_2', 'upload.steps_3', 'upload.steps_4',
];
const STYLE_CATEGORIES = ['Portrait', 'Landscape', 'Editorial', 'Abstract', 'Fashion', 'Street'];

export default function Upload() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addUserPrompt, currentUser, refreshPrompts } = useApp();
  const fileRef = useRef();
  const [step, setStep] = useState(0);
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [promptText, setPromptText] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [category, setCategory] = useState('');
  const [hasManualCategoryEdit, setHasManualCategoryEdit] = useState(false);
  const [hasManualTagsEdit, setHasManualTagsEdit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean).slice(0, 5);
  const autoCategory = normalizePromptCategory({ prompt: promptText, tags, manualCategory: 'Generated' });
  const recommendedCategory = hasManualCategoryEdit ? (category || autoCategory) : autoCategory;

  useEffect(() => {
    if (hasManualTagsEdit) return;
    if (!promptText.trim()) {
      setTagsInput('');
      return;
    }
    const autoTags = inferPromptTags({ prompt: promptText.trim(), limit: 5 });
    setTagsInput(autoTags.join(', '));
  }, [promptText, hasManualTagsEdit]);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setImage(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    if (!promptText.trim()) return;
    setUploading(true);
    try {
      let finalImageUrl = '';
      if (image) {
        try {
          const uploadRes = await api.uploadImage(image);
          finalImageUrl = uploadRes.url;
        } catch {
          finalImageUrl = imagePreview || '';
        }
      }

      const authorInfo = currentUser
        ? {
            name: currentUser.username,
            avatar: currentUser.avatar,
            promptCount: 1,
            userId: currentUser.id,
          }
        : { name: 'Anonymous', avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&auto=format&fit=crop&q=80', promptCount: 1, userId: null };

      // Write to backend first (persists across devices)
      const finalCategory = normalizePromptCategory({
        prompt: promptText.trim(),
        tags,
        manualCategory: hasManualCategoryEdit ? category : 'Generated',
      });

      const createdPrompt = await api.createPrompt({
        imageUrl: finalImageUrl,
        prompt: promptText.trim(),
        author: authorInfo,
        tags,
        category: finalCategory,
      });

      // Also update local state for immediate UI feedback
      addUserPrompt(createdPrompt);
      trackAction('act_upload', { category: finalCategory });

      setUploading(false);
      setSubmitted(true);
      setTimeout(() => navigate('/'), 2200);
    } catch (err) {
      setUploading(false);
      alert(t('upload.error', { message: err.message }));
    }
  };

  const canProceed = () => {
    if (step === 0) return !!image;
    if (step === 1) return promptText.trim().length > 10;
    if (step === 2) return true;
    if (step === 3) return true;
    return true;
  };

  if (submitted) {
    return (
      <motion.div className="upload-success" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: [0.34, 1.56, 0.64, 1] }}>
        <div className="upload-success__icon"><Check size={36} /></div>
        <h2 className="upload-success__title">{t('upload.success.title')}</h2>
        <p className="upload-success__text">{t('upload.success.text')}</p>
      </motion.div>
    );
  }

  return (
    <div className="upload">
      <div className="container">
        <div className="upload__header">
          <h1 className="upload__title">{t('upload.title')}</h1>
          <p className="upload__subtitle">{t('upload.subtitle')}</p>
        </div>

        <div className="upload__steps">
          {STEP_KEYS.map((key, i) => (
            <div key={i} className={`upload__step ${step === i ? 'active' : step > i ? 'done' : ''}`}>
              <div className="upload__step-num">{step > i ? <Check size={12} /> : i + 1}</div>
              <span className="upload__step-label">{t(key)}</span>
            </div>
          ))}
        </div>

        <div className="upload__body">
          <div className="upload__preview">
            {imagePreview ? (
              <div className="upload__preview-img-wrap">
                <img src={imagePreview} alt="Preview" className="upload__preview-img" />
                <button className="upload__preview-change" onClick={() => fileRef.current?.click()}>{t('upload.changeImage')}</button>
              </div>
            ) : (
              <div className={`upload__dropzone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}>
                <div className="upload__dropzone-icon"><Image size={32} strokeWidth={1.2} /></div>
                <p className="upload__dropzone-title">{t('upload.dropzoneTitle')}</p>
                <p className="upload__dropzone-sub">{t('upload.dropzoneSub')}</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="upload__file-input" onChange={e => handleFile(e.target.files[0])} />
          </div>

          <div className="upload__form">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="upload__form-step">
                  <div className="upload__form-label">
                    <span>{t('upload.step2Label')}</span>
                    <h3>{t('upload.step2Title')}</h3>
                    <p>{t('upload.step2Desc')}</p>
                  </div>
                  <textarea className="upload__textarea" placeholder={t('upload.promptPlaceholder')} value={promptText} onChange={e => setPromptText(e.target.value)} rows={8} />
                  <div className="upload__char-count">
                    {t('upload.charCount', { count: promptText.length })}
                    {promptText.length < 30 && promptText.length > 0 && <span className="upload__char-hint">{t('upload.charHint')}</span>}
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="upload__form-step">
                  <div className="upload__form-label">
                    <span>{t('upload.step3Label')}</span>
                    <h3>{t('upload.step3Title')}</h3>
                    <p>{t('upload.step3Desc')}</p>
                  </div>
                  <div className="upload__tags-input-wrap">
                    <Tag size={16} className="upload__tags-icon" />
                    <input
                      type="text"
                      className="upload__tags-input"
                      placeholder={t('upload.tagsPlaceholder')}
                      value={tagsInput}
                      onChange={(e) => {
                        setHasManualTagsEdit(true);
                        setTagsInput(e.target.value);
                      }}
                    />
                  </div>
                  {tags.length > 0 && (
                    <div className="upload__tags-preview">
                      {tags.map(tag => <span key={tag} className="upload__tag-chip">{tag}</span>)}
                    </div>
                  )}
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="upload__form-step">
                  <div className="upload__form-label">
                    <span>{t('upload.step4Label')}</span>
                    <h3>{t('upload.step4Title')}</h3>
                    <p>{t('upload.step4Desc')}</p>
                  </div>
                  <div className="upload__style-grid">
                    {STYLE_CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        className={`upload__style-btn ${category === cat ? 'active' : ''}`}
                        onClick={() => {
                          setHasManualCategoryEdit(true);
                          setCategory(cat);
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {step === 4 && (
                <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="upload__form-step">
                  <div className="upload__form-label">
                    <span>{t('upload.step5Label')}</span>
                    <h3>{t('upload.step5Title')}</h3>
                    <p>{t('upload.step5Desc')}</p>
                  </div>
                  <div className="upload__summary">
                    {imagePreview && (
                      <div className="upload__summary-row">
                        <span className="upload__summary-key">{t('upload.summaryKey.image')}</span>
                        <span className="upload__summary-val upload__summary-val--img"><img src={imagePreview} alt="" /></span>
                      </div>
                    )}
                    <div className="upload__summary-row">
                      <span className="upload__summary-key">{t('upload.summaryKey.prompt')}</span>
                      <span className="upload__summary-val upload__summary-val--mono">{promptText.slice(0, 80)}...</span>
                    </div>
                    {tags.length > 0 && (
                      <div className="upload__summary-row">
                        <span className="upload__summary-key">{t('upload.summaryKey.tags')}</span>
                        <span className="upload__summary-val">{tags.join(', ')}</span>
                      </div>
                    )}
                    {recommendedCategory && (
                      <div className="upload__summary-row">
                        <span className="upload__summary-key">{t('upload.summaryKey.style')}</span>
                        <span className="upload__summary-val">{recommendedCategory}</span>
                      </div>
                    )}
                    <div className="upload__summary-row">
                      <span className="upload__summary-key">{t('upload.summaryKey.author')}</span>
                      <span className="upload__summary-val">{currentUser ? currentUser.username : 'Anonymous'}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="upload__nav">
              {step > 0 && (
                <button className="upload__nav-back" onClick={() => setStep(s => s - 1)}><ArrowLeft size={15} /> {t('upload.back')}</button>
              )}
              {step < 4 ? (
                <button className="upload__nav-next" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
                  {t('upload.continue')} <ArrowRight size={15} />
                </button>
              ) : (
                <button className="upload__nav-submit" onClick={handleSubmit} disabled={uploading}>
                  {uploading ? <><span className="upload__dots"><span/><span/><span/></span>{t('upload.sharing')}</> : <><Sparkles size={15} />{t('upload.sharePrompt')}</>}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
