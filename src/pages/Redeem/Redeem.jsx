import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import './Redeem.css';

export default function Redeem() {
  const { t } = useTranslation();
  const { loadBilling } = useApp();
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!code.trim() || submitting) return;

    setSubmitting(true);
    setMessage('');
    setSuccess(false);
    try {
      const result = await api.redeemCard(code);
      await loadBilling();
      setCode('');
      setSuccess(true);
      setMessage(t('redeem.success', {
        plan: result.planLabel,
        credits: Number(result.credits || 0).toLocaleString(),
        images: Number(result.imageCount || 0).toLocaleString(),
      }));
    } catch (error) {
      setMessage(error.message || t('billing.redeemFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="redeem-page">
      <div className="redeem-page__inner container">
        <div className="redeem-page__eyebrow">{t('nav.redeem')}</div>
        <h1 className="redeem-page__title">{t('redeem.title')}</h1>
        <p className="redeem-page__subtitle">{t('redeem.subtitle')}</p>

        <form className="redeem-card" onSubmit={handleSubmit}>
          <label className="redeem-card__label" htmlFor="redeem-code">
            {t('redeem.codeLabel')}
          </label>
          <input
            id="redeem-code"
            className="redeem-card__input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder={t('redeem.placeholder')}
            autoComplete="off"
            spellCheck="false"
            disabled={submitting}
          />
          <button
            className="redeem-card__button"
            type="submit"
            disabled={submitting || !code.trim()}
          >
            {submitting ? t('redeem.processing') : t('redeem.submit')}
          </button>
          {message && (
            <p className={`redeem-card__message ${success ? 'redeem-card__message--success' : ''}`}>
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
