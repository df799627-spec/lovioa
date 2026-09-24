import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Sparkles, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { trackAction } from '../../services/analytics';
import './Auth.css';

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getPasswordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function getPasswordStrengthLabel(score) {
  if (score <= 1) return 'weak';
  if (score <= 3) return 'medium';
  return 'strong';
}

export default function Auth() {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, googleLogin, forgotPassword, resetPassword } = useApp();
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const googleBtnRef = useRef(null);

  // Field-level validation
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    const modeParam = searchParams.get('mode');
    const tokenParam = searchParams.get('token');
    if (modeParam === 'reset' && tokenParam) {
      setMode('reset');
      setResetToken(tokenParam);
      setError('');
      setSuccess('');
      setFieldErrors({});
    }
  }, [searchParams]);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    if (!(mode === 'login' || mode === 'register')) return;
    let cancelled = false;

    const initGoogle = () => {
      if (cancelled) return;
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            setGoogleBusy(true);
            setError('');
            if (!response?.credential) throw new Error(t('auth.errors.serverError'));
            await googleLogin(response.credential);
            setSuccess(t('auth.success.login'));
            setTimeout(redirectAfterLogin, 800);
          } catch (err) {
            setError(err.message || t('auth.errors.serverError'));
          } finally {
            setGoogleBusy(false);
          }
        },
      });

      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 360,
      });
    };

    if (window.google?.accounts?.id) {
      initGoogle();
      return () => { cancelled = true; };
    }

    const existing = document.querySelector('script[data-google-identity="1"]');
    if (existing) {
      existing.addEventListener('load', initGoogle, { once: true });
      return () => { cancelled = true; };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = '1';
    script.onload = initGoogle;
    document.head.appendChild(script);

    return () => { cancelled = true; };
  }, [GOOGLE_CLIENT_ID, mode, googleLogin, navigate, t]);

  const validateFields = () => {
    const errors = {};
    if (mode === 'register') {
      if (!username.trim()) {
        errors.username = t('auth.errors.usernameRequired');
      } else if (username.trim().length < 2) {
        errors.username = t('auth.errors.usernameTooShort');
      }
    }
    if (mode === 'login' || mode === 'register' || mode === 'forgot') {
      if (!email.trim()) {
        errors.email = t('auth.errors.emailRequired');
      } else if (!validateEmail(email)) {
        errors.email = t('auth.errors.emailInvalid');
      }
    }
    if (mode !== 'forgot') {
      if (!password) {
        errors.password = t('auth.errors.passwordRequired');
      } else if (password.length < 6) {
        errors.password = t('auth.errors.passwordTooShort');
      }
    }
    if (mode === 'reset') {
      if (!resetToken.trim()) {
        errors.token = t('auth.errors.resetTokenRequired');
      }
      if (!confirmPassword) {
        errors.confirmPassword = t('auth.errors.passwordRequired');
      } else if (confirmPassword !== password) {
        errors.confirmPassword = t('auth.errors.passwordMismatch');
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const redirectAfterLogin = () => {
    const fromQuery = searchParams.get('from');
    if (typeof fromQuery === 'string' && fromQuery.startsWith('/')) {
      navigate(fromQuery, { replace: true });
      return;
    }
    const from = location.state?.from;
    if (typeof from === 'string' && from.startsWith('/')) {
      navigate(from, { replace: true });
      return;
    }
    const onboardingDone = localStorage.getItem('pf_onboarding_done') === 'true';
    navigate(onboardingDone ? '/' : '/onboarding');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateFields()) return;

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
        trackAction('act_login');
        setSuccess(t('auth.success.login'));
        setTimeout(redirectAfterLogin, 1200);
      } else if (mode === 'register') {
        await register(username.trim(), email.trim(), password);
        trackAction('act_register');
        setSuccess(t('auth.success.register'));
        setTimeout(redirectAfterLogin, 1200);
      } else if (mode === 'forgot') {
        await forgotPassword(email.trim());
        setSuccess(t('auth.success.forgotPassword'));
      } else if (mode === 'reset') {
        await resetPassword(resetToken.trim(), password);
        setSuccess(t('auth.success.resetPassword'));
        setTimeout(() => switchMode('login'), 1200);
      } else {
        setError(t('auth.errors.serverError'));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setError('');
    setSuccess('');
    setFieldErrors({});
    if (newMode !== 'reset') setResetToken('');
    setConfirmPassword('');
  };

  const pwStrength = getPasswordStrength(password);
  const pwStrengthKey = getPasswordStrengthLabel(pwStrength);

  return (
    <div className="auth-page">
      <div className="auth-page__card">
        <div className="auth-page__logo">
          <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
            <rect x="2" y="2" width="10" height="10" rx="2" fill="var(--color-accent)"/>
            <rect x="16" y="2" width="10" height="10" rx="2" fill="var(--color-accent)" opacity="0.5"/>
            <rect x="2" y="16" width="10" height="10" rx="2" fill="var(--color-accent)" opacity="0.5"/>
            <rect x="16" y="16" width="10" height="10" rx="2" fill="var(--color-accent)"/>
          </svg>
          <span className="auth-page__brand">{t('brand')}</span>
        </div>

        <div className="auth-page__tabs">
          <button
            className={`auth-page__tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            {t('auth.signIn')}
          </button>
          <button
            className={`auth-page__tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            {t('auth.createAccount')}
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            className="auth-page__form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, x: mode === 'register' ? 20 : -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === 'register' ? -20 : 20 }}
            transition={{ duration: 0.2 }}
            noValidate
          >
            {mode === 'register' && (
              <motion.div
                key="username-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="auth-page__field"
              >
                <label className="auth-page__label">{t('auth.username')}</label>
                <input
                  type="text"
                  className={`auth-page__input ${fieldErrors.username ? 'auth-page__input--error' : username.trim().length >= 2 ? 'auth-page__input--valid' : ''}`}
                  placeholder={t('auth.usernamePlaceholder')}
                  value={username}
                  onChange={e => { setUsername(e.target.value); if (fieldErrors.username) setFieldErrors(p => ({ ...p, username: '' })); }}
                  autoComplete="username"
                />
                {fieldErrors.username && (
                  <span className="auth-page__field-error">
                    <AlertCircle size={12} />{fieldErrors.username}
                  </span>
                )}
              </motion.div>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <div className="auth-page__field">
              <label className="auth-page__label">{t('auth.email')}</label>
              <div className="auth-page__input-wrap">
                <input
                  type="email"
                  className={`auth-page__input ${fieldErrors.email ? 'auth-page__input--error' : email && validateEmail(email) ? 'auth-page__input--valid' : ''}`}
                  placeholder={t('auth.emailPlaceholder')}
                  value={email}
                  onChange={e => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors(p => ({ ...p, email: '' })); }}
                  autoComplete="email"
                />
                {email && validateEmail(email) && (
                  <CheckCircle size={16} className="auth-page__input-check auth-page__input-check--valid" />
                )}
              </div>
              {fieldErrors.email && (
                <span className="auth-page__field-error">
                  <AlertCircle size={12} />{fieldErrors.email}
                </span>
              )}
            </div>
            )}

            {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div className="auth-page__field">
              <label className="auth-page__label">{t('auth.password')}</label>
              <div className="auth-page__pw-wrap">
                <input
                  type={showPw ? 'text' : 'password'}
                  className={`auth-page__input auth-page__input--pw ${fieldErrors.password ? 'auth-page__input--error' : password.length >= 6 ? 'auth-page__input--valid' : ''}`}
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={e => { setPassword(e.target.value); if (fieldErrors.password) setFieldErrors(p => ({ ...p, password: '' })); }}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  className="auth-page__pw-toggle"
                  onClick={() => setShowPw(p => !p)}
                  tabIndex={-1}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && (
                <span className="auth-page__field-error">
                  <AlertCircle size={12} />{fieldErrors.password}
                </span>
              )}
              {(mode === 'register' || mode === 'reset') && password && (
                <div className="auth-page__pw-strength">
                  <div className="auth-page__pw-strength-bars">
                    {[1, 2, 3].map(level => (
                      <div key={level} className={`auth-page__pw-strength-bar ${pwStrength >= level ? `auth-page__pw-strength-bar--${pwStrengthKey}` : ''}`} />
                    ))}
                  </div>
                  <span className={`auth-page__pw-strength-label auth-page__pw-strength-label--${pwStrengthKey}`}>
                    {t(`auth.passwordStrength.${pwStrengthKey}`)}
                  </span>
                </div>
              )}
            </div>
            )}

            {mode === 'reset' && (
              <>
                <div className="auth-page__field">
                  <label className="auth-page__label">{t('auth.resetToken')}</label>
                  <input
                    type="text"
                    className={`auth-page__input ${fieldErrors.token ? 'auth-page__input--error' : ''}`}
                    placeholder={t('auth.resetTokenPlaceholder')}
                    value={resetToken}
                    onChange={e => { setResetToken(e.target.value); if (fieldErrors.token) setFieldErrors(p => ({ ...p, token: '' })); }}
                    autoComplete="off"
                  />
                  {fieldErrors.token && (
                    <span className="auth-page__field-error">
                      <AlertCircle size={12} />{fieldErrors.token}
                    </span>
                  )}
                </div>

                <div className="auth-page__field">
                  <label className="auth-page__label">{t('auth.confirmPassword')}</label>
                  <input
                    type={showPw ? 'text' : 'password'}
                    className={`auth-page__input ${fieldErrors.confirmPassword ? 'auth-page__input--error' : confirmPassword && confirmPassword === password ? 'auth-page__input--valid' : ''}`}
                    placeholder={t('auth.confirmPasswordPlaceholder')}
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); if (fieldErrors.confirmPassword) setFieldErrors(p => ({ ...p, confirmPassword: '' })); }}
                    autoComplete="new-password"
                  />
                  {fieldErrors.confirmPassword && (
                    <span className="auth-page__field-error">
                      <AlertCircle size={12} />{fieldErrors.confirmPassword}
                    </span>
                  )}
                </div>
              </>
            )}

            {error && (
              <motion.div
                className="auth-page__error"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <AlertCircle size={14} />
                <span>{error}</span>
              </motion.div>
            )}

            {success && (
              <motion.div
                className="auth-page__success"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <CheckCircle size={14} />
                <span>{success}</span>
              </motion.div>
            )}

            <button
              type="submit"
              className="auth-page__submit"
              disabled={loading || googleBusy}
            >
              {loading ? (
                <span className="auth-page__dots"><span/><span/><span/></span>
              ) : (
                <>
                  <Sparkles size={15} />
                  {mode === 'login'
                    ? t('auth.submitSignIn')
                    : mode === 'register'
                      ? t('auth.submitCreate')
                      : mode === 'forgot'
                        ? t('auth.submitForgotPassword')
                        : t('auth.submitResetPassword')}
                </>
              )}
            </button>

            {mode === 'login' && (
              <button
                type="button"
                className="auth-page__switch-btn auth-page__forgot-btn"
                onClick={() => switchMode('forgot')}
              >
                {t('auth.forgotPassword')}
              </button>
            )}

            {(mode === 'login' || mode === 'register') && GOOGLE_CLIENT_ID && (
              <div className="auth-page__google-wrap">
                <div className="auth-page__google-divider">
                  <span>{t('auth.or', 'or')}</span>
                </div>
                <div ref={googleBtnRef} className="auth-page__google-btn" />
              </div>
            )}
          </motion.form>
        </AnimatePresence>

        <p className="auth-page__switch">
          {mode === 'login' || mode === 'forgot' || mode === 'reset' ? t('auth.switchToSignUp') : t('auth.switchToSignIn')}
          <button
            className="auth-page__switch-btn"
            onClick={() => switchMode(mode === 'login' || mode === 'forgot' || mode === 'reset' ? 'register' : 'login')}
          >
            {mode === 'login' || mode === 'forgot' || mode === 'reset' ? t('auth.signUp') : t('auth.signInLink')}
          </button>
        </p>
      </div>
    </div>
  );
}
