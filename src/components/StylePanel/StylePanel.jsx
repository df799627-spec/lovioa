import { useState, useRef, useEffect } from 'react';
import { Upload, Image, Sparkles, Wand2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import './StylePanel.css';

export default function StylePanel({ prompt, onGenerate }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('text'); // 'text' | 'reference'
  const [editPrompt, setEditPrompt] = useState(prompt);
  const [refImage, setRefImage] = useState(null);
  const [refImagePreview, setRefImagePreview] = useState('');
  const [refInstruction, setRefInstruction] = useState('');
  useEffect(() => {
    if (!refInstruction) setRefInstruction(t('stylePanel.refInstructionDefault'));
  }, [t]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setEditPrompt(prompt || '');
  }, [prompt]);
  const [strength, setStrength] = useState(0.6);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    setRefImage(file);
    const reader = new FileReader();
    reader.onload = e => setRefImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleGenerateClick = () => {
    if (activeTab === 'text') {
      onGenerate({ mode: 'text', prompt: editPrompt });
    } else {
      if (!refImage) return;
      onGenerate({ mode: 'reference', prompt: refInstruction, image: refImage, strength });
    }
  };

  const removeRefImage = () => {
    setRefImage(null);
    setRefImagePreview('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const strengthLabel =
    strength < 0.4 ? t('stylePanel.strengthRespect') :
    strength < 0.7 ? t('stylePanel.strengthBalance') :
    t('stylePanel.strengthEmphasize');

  return (
    <div className="style-panel">
      {/* Tab switcher */}
      <div className="style-panel__tabs">
        <button
          className={`style-panel__tab ${activeTab === 'text' ? 'active' : ''}`}
          onClick={() => setActiveTab('text')}
        >
          <Sparkles size={14} />
          {t('stylePanel.textMode')}
        </button>
        <button
          className={`style-panel__tab ${activeTab === 'reference' ? 'active' : ''}`}
          onClick={() => setActiveTab('reference')}
        >
          <Wand2 size={14} />
          {t('stylePanel.referenceMode')}
        </button>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {activeTab === 'text' ? (
          <motion.div
            key="text-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="style-panel__content"
          >
            <div className="style-panel__label">{t('stylePanel.promptPreview')}</div>
            <textarea
              className="style-panel__prompt-textarea"
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              rows={6}
              placeholder={t('stylePanel.promptEditPlaceholder')}
            />
            <div className="style-panel__hint">
              {t('stylePanel.promptEditHint')}
            </div>

            <button
              className="style-panel__generate-btn"
              onClick={handleGenerateClick}
            >
              <Sparkles size={16} />
              {t('stylePanel.generateBtn')}
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="reference-tab"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="style-panel__content"
          >
            {/* Reference image upload */}
            <div className="style-panel__label">{t('stylePanel.uploadSection')}</div>

            {refImagePreview ? (
              <div className="style-panel__ref-preview">
                <img src={refImagePreview} alt="Reference" className="style-panel__ref-img" />
                <button className="style-panel__ref-remove" onClick={removeRefImage}>
                  <X size={12} />
                </button>
                <div className="style-panel__ref-badge">
                  <Image size={12} />
                  {t('stylePanel.refUploaded')}
                </div>
              </div>
            ) : (
              <div
                className={`style-panel__dropzone ${dragOver ? 'drag-over' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
              >
                <div className="style-panel__dropzone-icon">
                  <Upload size={24} strokeWidth={1.2} />
                </div>
                <p className="style-panel__dropzone-title">{t('stylePanel.dropzoneTitle')}</p>
                <p className="style-panel__dropzone-sub">{t('stylePanel.dropzoneSub')}</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="style-panel__file-input"
              onChange={e => handleFile(e.target.files?.[0])}
            />

            {/* Instruction */}
            {refImagePreview && (
              <div className="style-panel__instruction-wrap">
                <div className="style-panel__label">
                  {t('stylePanel.instructionLabel')}
                  <span className="style-panel__label-hint">{t('stylePanel.instructionHint')}</span>
                </div>
                <textarea
                  className="style-panel__instruction-textarea"
                  value={refInstruction}
                  onChange={e => setRefInstruction(e.target.value)}
                  rows={4}
                  placeholder={t('stylePanel.instructionPlaceholder')}
                />

                {/* Strength slider */}
                <div className="style-panel__strength-wrap">
                  <div className="style-panel__strength-label">
                    <span>{t('stylePanel.strengthLabel')}</span>
                    <span className="style-panel__strength-value">{strengthLabel}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.95"
                    step="0.05"
                    value={strength}
                    onChange={e => setStrength(parseFloat(e.target.value))}
                    className="style-panel__strength-slider"
                    style={{ '--val': `${Math.round(strength * 100)}%` }}
                  />
                  <div className="style-panel__strength-scale">
                    <span>{t('stylePanel.strengthRespect')}</span>
                    <span>{t('stylePanel.strengthEmphasize')}</span>
                  </div>
                </div>
              </div>
            )}

            <button
              className={`style-panel__generate-btn ${!refImage ? 'disabled' : ''}`}
              onClick={handleGenerateClick}
              disabled={!refImage}
            >
              <Wand2 size={16} />
              {refImage ? t('stylePanel.generateRefBtn') : t('stylePanel.generateRefDisabled')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
