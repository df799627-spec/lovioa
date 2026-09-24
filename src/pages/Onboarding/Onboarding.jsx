import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { trackAction } from '../../services/analytics';
import './Onboarding.css';

const SOURCES = [
  { id: 'socialMedia',  icon: '📱', labelKey: 'onboarding.sources.socialMedia' },
  { id: 'searchEngine', icon: '🔍', labelKey: 'onboarding.sources.searchEngine' },
  { id: 'friend',       icon: '👥', labelKey: 'onboarding.sources.friend' },
  { id: 'newsletter',   icon: '📧', labelKey: 'onboarding.sources.newsletter' },
  { id: 'github',       icon: '💻', labelKey: 'onboarding.sources.github' },
  { id: 'other',        icon: '✨', labelKey: 'onboarding.sources.other' },
];

const ROLES = [
  { id: 'developer',   icon: '⌨️',  labelKey: 'onboarding.roles.developer' },
  { id: 'designer',    icon: '🎨',  labelKey: 'onboarding.roles.designer' },
  { id: 'marketer',    icon: '📣',  labelKey: 'onboarding.roles.marketer' },
  { id: 'writer',      icon: '✍️',  labelKey: 'onboarding.roles.writer' },
  { id: 'student',     icon: '🎓',  labelKey: 'onboarding.roles.student' },
  { id: 'researcher',  icon: '🔬',  labelKey: 'onboarding.roles.researcher' },
  { id: 'other',       icon: '✨',  labelKey: 'onboarding.roles.other' },
];

const USE_CASES = [
  { id: 'imageGeneration', icon: '🖼️', labelKey: 'onboarding.useCases.imageGeneration' },
  { id: 'contentWriting',  icon: '📝', labelKey: 'onboarding.useCases.contentWriting' },
  { id: 'codeAssistance', icon: '🔧', labelKey: 'onboarding.useCases.codeAssistance' },
  { id: 'brainstorming',  icon: '💡', labelKey: 'onboarding.useCases.brainstorming' },
  { id: 'learning',       icon: '📚', labelKey: 'onboarding.useCases.learning' },
  { id: 'hobby',          icon: '🎯', labelKey: 'onboarding.useCases.hobby' },
];

const STEPS = 3;

const STEP_LABELS = ['Discover', 'Profile', 'Use case'];

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
      <path d="M2 5.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M3 6.5h7M7.5 3.5L11 6.5l-3.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M6.5 1.5L7.4 4.8H10.8L8 7l.8 3.3L6.5 8.5 4.2 10.3l.8-3.3-2.8-2.2H5.6L6.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function StarburstIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.22 4.22l1.42 1.42M12.36 12.36l1.42 1.42M4.22 13.78l1.42-1.42M12.36 5.64l1.42-1.42" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="9" r="2.5" fill="var(--color-accent)" opacity="0.3" stroke="var(--color-accent)" strokeWidth="1.2"/>
    </svg>
  );
}

export default function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { completeOnboarding, hasCompletedOnboarding, currentUser } = useApp();

  const [step, setStep] = useState(1);
  const [source, setSource] = useState([]);
  const [role, setRole] = useState('');
  const [useCase, setUseCase] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasCompletedOnboarding) {
      navigate('/', { replace: true });
    }
  }, [hasCompletedOnboarding, navigate]);

  useEffect(() => {
    if (!currentUser) {
      navigate('/auth', { replace: true });
    }
  }, [currentUser, navigate]);

  const toggleSource = (id) => {
    setSource(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const toggleUseCase = (id) => {
    setUseCase(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]);
  };

  const handleNext = () => {
    if (step < STEPS) setStep(s => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(s => s - 1);
  };

  const handleDone = async () => {
    setLoading(true);
    trackAction('act_onboarding_complete', { source, role, useCase });
    completeOnboarding({ source, role, useCase }).catch(() => {});
    navigate('/', { replace: true });
  };

  const handleSkip = async () => {
    setLoading(true);
    trackAction('act_onboarding_skip', { source, role, useCase });
    completeOnboarding({ source: [], role: '', useCase: [] }).catch(() => {});
    navigate('/', { replace: true });
  };

  const stepVariants = {
    enter: (dir) => ({ opacity: 0, x: dir > 0 ? 32 : -32, scale: 0.97 }),
    center: { opacity: 1, x: 0, scale: 1 },
    exit: (dir) => ({ opacity: 0, x: dir > 0 ? -32 : 32, scale: 0.97 }),
  };

  return (
    <div className="onboarding-page">
      <motion.div
        className="onboarding-card"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header */}
        <div className="onboarding-card__header">
          <div className="onboarding-card__icon-row">
            <div className="onboarding-card__eyebrow-icon">
              <StarburstIcon />
            </div>
            <span className="onboarding-card__eyebrow">{t('onboarding.eyebrow')}</span>
          </div>
          <h1 className="onboarding-card__title">{t('onboarding.title')}</h1>
          <p className="onboarding-card__subtitle">{t('onboarding.subtitle')}</p>
        </div>

        {/* Step indicator */}
        <div className="onboarding-steps" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={STEPS}>
          {Array.from({ length: STEPS }, (_, i) => {
            const n = i + 1;
            const isActive = n === step;
            const isDone = n < step;
            const cls = isActive ? 'active' : isDone ? 'done' : 'inactive';
            return (
              <div key={i} className={`onboarding-step ${cls}`}>
                <div className="onboarding-step__dot">
                  {isDone ? (
                    <CheckIcon />
                  ) : (
                    <span>{n}</span>
                  )}
                </div>
                <span className="onboarding-step__label">{STEP_LABELS[i]}</span>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="onboarding-card__body">
          <AnimatePresence mode="wait" custom={step}>
            {step === 1 && (
              <motion.div
                key="step1"
                custom={1}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="onboarding-step-content"
              >
                <div className="onboarding-step-content__heading">
                  <div className="onboarding-step-content__label">
                    <span className="onboarding-step-content__label-dot" />
                    {t('onboarding.step', { n: 1, total: STEPS })}
                  </div>
                  <h2 className="onboarding-step-content__title">{t('onboarding.step1.title')}</h2>
                </div>
                <div className="onboarding-chips">
                  {SOURCES.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={`onboarding-chip ${source.includes(s.id) ? 'selected' : ''}`}
                      onClick={() => toggleSource(s.id)}
                    >
                      <span className="onboarding-chip__icon">{s.icon}</span>
                      {t(s.labelKey)}
                      {source.includes(s.id) && (
                        <span className="onboarding-chip__check">
                          <CheckIcon />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                custom={1}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="onboarding-step-content"
              >
                <div className="onboarding-step-content__heading">
                  <div className="onboarding-step-content__label">
                    <span className="onboarding-step-content__label-dot" />
                    {t('onboarding.step', { n: 2, total: STEPS })}
                  </div>
                  <h2 className="onboarding-step-content__title">{t('onboarding.step2.title')}</h2>
                </div>
                <div className="onboarding-role-cards">
                  {ROLES.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      className={`onboarding-role-card ${role === r.id ? 'selected' : ''}`}
                      onClick={() => setRole(r.id)}
                    >
                      <div className="onboarding-role-card__icon-wrap">
                        <span className="onboarding-role-card__icon">{r.icon}</span>
                      </div>
                      <span className="onboarding-role-card__label">{t(r.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                custom={1}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="onboarding-step-content"
              >
                <div className="onboarding-step-content__heading">
                  <div className="onboarding-step-content__label">
                    <span className="onboarding-step-content__label-dot" />
                    {t('onboarding.step', { n: 3, total: STEPS })}
                  </div>
                  <h2 className="onboarding-step-content__title">{t('onboarding.step3.title')}</h2>
                </div>
                <div className="onboarding-chips">
                  {USE_CASES.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      className={`onboarding-chip ${useCase.includes(u.id) ? 'selected' : ''}`}
                      onClick={() => toggleUseCase(u.id)}
                    >
                      <span className="onboarding-chip__icon">{u.icon}</span>
                      {t(u.labelKey)}
                      {useCase.includes(u.id) && (
                        <span className="onboarding-chip__check">
                          <CheckIcon />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Skip hint */}
        <div className="onboarding-card__skip-hint">
          <SparkleIcon />
          {t('onboarding.skipHint')}
        </div>

        {/* Actions */}
        <div className="onboarding-card__actions">
          {step > 1 && (
            <button
              type="button"
              className="onboarding-btn onboarding-btn--ghost"
              onClick={handleBack}
              disabled={loading}
            >
              Back
            </button>
          )}
          <div className="onboarding-card__actions-right">
            <button
              type="button"
              className="onboarding-btn onboarding-btn--text"
              onClick={handleSkip}
              disabled={loading}
            >
              {t('onboarding.skip')}
            </button>
            {step < STEPS ? (
              <button
                type="button"
                className="onboarding-btn onboarding-btn--primary"
                onClick={handleNext}
              >
                {t('onboarding.next')}
                <ArrowRightIcon />
              </button>
            ) : (
              <button
                type="button"
                className="onboarding-btn onboarding-btn--primary"
                onClick={handleDone}
                disabled={loading}
              >
                {loading ? (
                  <span className="onboarding-btn__spinner" />
                ) : (
                  <>
                    {t('onboarding.done')}
                    <CheckIcon />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}