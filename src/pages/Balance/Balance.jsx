import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { BILLING_PLANS, CREDITS_PER_IMAGE } from '../../config/billingPlans';
import './Balance.css';

function normalizeCredits(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (!raw || typeof raw !== 'object') return 0;
  if (raw.balance && typeof raw.balance === 'object') {
    const b = raw.balance;
    if (typeof b.totalCredits === 'number' && Number.isFinite(b.totalCredits)) {
      return b.totalCredits;
    }
    if (typeof b.balance === 'number' && Number.isFinite(b.balance)) return b.balance;
    const free = Number(b.freeCredits ?? b.free_credits ?? 0);
    const paid = Number(b.paidCredits ?? b.paid_credits ?? 0);
    if (Number.isFinite(free) && Number.isFinite(paid)) return free + paid;
    return 0;
  }
  if (typeof raw.totalCredits === 'number' && Number.isFinite(raw.totalCredits)) {
    return raw.totalCredits;
  }
  if (typeof raw.balance === 'number' && Number.isFinite(raw.balance)) return raw.balance;
  const free = Number(raw.freeCredits ?? raw.free_credits ?? 0);
  const paid = Number(raw.paidCredits ?? raw.paid_credits ?? 0);
  if (Number.isFinite(free) && Number.isFinite(paid)) return free + paid;
  return 0;
}

export default function Balance() {
  const { t } = useTranslation();
  const { currentUser } = useApp();
  const [balance, setBalance] = useState(0);
  const [selectedPlan, setSelectedPlan] = useState('standard_cny');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadBalance = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await api.billingBalance();
      setBalance(normalizeCredits(data?.balance ?? data));
      setLastUpdated(new Date());
    } catch {
      // silent — balance shows 0
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;
    let cancelled = false;
    api.billingBalance()
      .then(data => {
        if (cancelled) return;
        setBalance(normalizeCredits(data?.balance ?? data));
        setLastUpdated(new Date());
      })
      .catch(() => {
        // silent — balance shows 0
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const handleTopUp = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      if (selectedPackage.domesticPaymentUrl) {
        window.location.assign(selectedPackage.domesticPaymentUrl);
        return;
      }
      const data = await api.billingCheckout(selectedPlan);
      if (data.url) {
        window.location.href = data.url;
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(err.message || t('billing.topUpFailed'));
      setLoading(false);
    }
  };

  const selectedPackage = BILLING_PLANS.find(plan => plan.id === selectedPlan) || BILLING_PLANS[1];

  return (
    <div className="balance-page">
      <div className="balance-page__inner container">
        <div className="balance-page__header">
          <div className="balance-page__eyebrow">Credits</div>
          <h1 className="balance-page__title">{t('balance.title')}</h1>
          <p className="balance-page__subtitle">{t('balance.subtitle')}</p>
        </div>

        <div className="balance-page__card">
          <div className="balance-card">
            <div className="balance-card__icon">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                <circle cx="14" cy="14" r="13" stroke="var(--color-accent)" strokeWidth="1.5"/>
                <path d="M14 8v12M10 11l4-3 4 3M10 17l4 3 4-3" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="balance-card__info">
              <div className="balance-card__label">{t('balance.currentCredits')}</div>
              <div className="balance-card__amount">
                {balance.toLocaleString()}
                <span className="balance-card__unit"> {t('balance.points')}</span>
              </div>
              <div className="balance-card__equivalent">
                {t('balance.imageEquivalent', {
                  count: Math.floor(balance / CREDITS_PER_IMAGE).toLocaleString(),
                })}
              </div>
            </div>
            <button className="balance-card__refresh" onClick={loadBalance} title={t('balance.refresh')}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M12.5 2.5v4h-4M1.5 11.5v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10.5 2.5A5 5 0 1 1 5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {lastUpdated && (
            <div className="balance-card__updated">
              {t('balance.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>

        <div className="balance-page__top-up">
          <div className="balance-page__section-title">{t('balance.topUp')}</div>
          <p className="balance-page__section-desc">{t('balance.topUpDesc')}</p>

          <div className="balance-page__amounts">
            {BILLING_PLANS.map(plan => (
              <button
                key={plan.id}
                className={`balance-page__amount-btn ${selectedPlan === plan.id ? 'active' : ''}`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                <span className="balance-page__amount-label">¥{plan.price / 100}</span>
                <span className="balance-page__amount-credits">
                  {plan.credits.toLocaleString()} {t('balance.points')}
                  {' · '}
                  {t('balance.imageEquivalent', { count: plan.fastCredits.toLocaleString() })}
                </span>
              </button>
            ))}
          </div>

          {error && (
            <div className="balance-page__error">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="#dc2626" strokeWidth="1.5"/>
                <path d="M8 5v3M8 10.5v.5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          <button
            className="balance-page__top-up-btn"
            onClick={handleTopUp}
            disabled={loading || !currentUser}
          >
            {loading ? (
              <>
                <span className="balance-page__spinner" />
                {t('balance.processing')}
              </>
            ) : (
              <>
                {t('balance.buyPackage')} ¥{selectedPackage.price / 100}
              </>
            )}
          </button>
          <p className="balance-page__payment-hint">{t('subscribe.domesticPaymentHint')}</p>
        </div>

        <div className="balance-page__info-grid">
          <div className="balance-page__info-card">
            <div className="balance-page__info-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 2l7 4v4c0 4-5 7-7 8-2-1-7-4-7-8V6l7-4z" stroke="var(--color-accent)" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="balance-page__info-title">{t('balance.howWorks')}</div>
              <div className="balance-page__info-desc">{t('balance.howWorksDesc')}</div>
            </div>
          </div>
          <div className="balance-page__info-card">
            <div className="balance-page__info-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="8" stroke="var(--color-accent)" strokeWidth="1.3"/>
                <path d="M10 6v5M10 13v.5" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="balance-page__info-title">{t('balance.noExpiry')}</div>
              <div className="balance-page__info-desc">{t('balance.noExpiryDesc')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
