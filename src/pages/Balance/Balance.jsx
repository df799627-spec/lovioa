import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { PAYMENT_PLANS, CREDITS_PER_IMAGE } from '../../config/billingPlans';
import {
  VIDEO_BILLING_DEFAULTS,
  VIDEO_SAMPLE_DURATION,
  getVideoCapacity,
  getVideoCost,
} from '../../config/videoBilling';
import './Balance.css';

const PLAN_COVER_IMAGES = {
  starter: '/assets/pricing/starter-cover-v2.webp',
  standard: '/assets/pricing/standard-cover-v2.webp',
  advanced: '/assets/pricing/standard-cover-v2.webp',
  premium: '/assets/pricing/premium-cover-v2.webp',
};

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
  const featuredVideoPricing = VIDEO_BILLING_DEFAULTS.find(video => video.model === 'video_h3')
    || VIDEO_BILLING_DEFAULTS[0];

  const loadBalance = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await api.billingBalance();
      setBalance(normalizeCredits(data?.balance ?? data));
      setLastUpdated(new Date());
    } catch (error) {
      setError(error?.message || '积分余额加载失败，请刷新重试');
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
      .catch(error => {
        if (!cancelled) {
          setError(error?.message || '积分余额加载失败，请刷新重试');
        }
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
        window.location.assign(data.url);
      } else {
        setLoading(false);
      }
    } catch (err) {
      setError(err.message || t('billing.topUpFailed'));
      setLoading(false);
    }
  };

  const selectedPackage = PAYMENT_PLANS.find(plan => plan.id === selectedPlan) || PAYMENT_PLANS[1];

  return (
    <div className="balance-page">
      <div className="balance-page__inner container">
        <header className="balance-page__header">
          <h1 className="balance-page__title">{t('balance.title')}</h1>
          <p className="balance-page__subtitle">{t('balance.subtitle')}</p>
        </header>

        <section className="balance-page__balance" aria-label={t('balance.currentCredits')}>
          <div className="balance-page__balance-main">
            <div className="balance-page__balance-amount">{balance.toLocaleString()}</div>
            <div className="balance-page__balance-unit">{t('balance.points')}</div>
          </div>
          <div className="balance-page__balance-meta">
            <span className="balance-page__balance-equivalent">
              {t('balance.imageEquivalent', {
                count: Math.floor(balance / CREDITS_PER_IMAGE).toLocaleString(),
              })}
            </span>
            <button className="balance-page__refresh" onClick={loadBalance} title={t('balance.refresh')}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M12.5 2.5v4h-4M1.5 11.5v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M10.5 2.5A5 5 0 1 1 5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {t('balance.refresh')}
            </button>
            {lastUpdated && (
              <span className="balance-page__updated">
                {t('balance.lastUpdated')}: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </section>

        <section className="balance-page__section">
          <div className="balance-page__section-head">
            <h2 className="balance-page__section-title">{t('subscribe.videoPricingTitle')}</h2>
            <p className="balance-page__section-desc">{t('subscribe.videoPricingSubtitle')}</p>
          </div>

          <div className="balance-page__video-summary">
            <div className="balance-page__video-summary-cell">
              <span>{featuredVideoPricing.label}</span>
              <strong>{getVideoCost(featuredVideoPricing, VIDEO_SAMPLE_DURATION)}</strong>
              <small>{t('subscribe.points')} / {VIDEO_SAMPLE_DURATION} {t('subscribe.videoPricingSecond')}</small>
            </div>
            <div className="balance-page__video-summary-cell">
              <span>{t('subscribe.videoPricingSharedPool')}</span>
              <strong>{selectedPackage.credits.toLocaleString()}</strong>
            </div>
          </div>

          <div className="balance-page__ledger">
            <div className="balance-page__ledger-head" aria-hidden="true">
              <span>{t('subscribe.videoPricingTitle')}</span>
              <span>{t('subscribe.videoPricingSample')}</span>
              <span>{t('subscribe.points')} / {t('subscribe.videoPricingSecond')}</span>
              <span>{t('subscribe.videoPricingSecond')}</span>
              <span>{t('subscribe.videoPricingVideos')}</span>
            </div>
            {VIDEO_BILLING_DEFAULTS.map(pricing => {
              const sampleCost = getVideoCost(pricing, VIDEO_SAMPLE_DURATION);
              const capacity = getVideoCapacity(
                selectedPackage.credits,
                pricing,
                VIDEO_SAMPLE_DURATION,
              );
              return (
                <div className="balance-page__video-model" key={pricing.model}>
                  <div className="balance-page__video-model-name">
                    <strong>{pricing.label}</strong>
                    <small>{pricing.model}</small>
                  </div>
                  <div className="balance-page__video-model-stat">
                    <strong>{sampleCost}</strong>
                    <span>{t('subscribe.videoPricingSample')}</span>
                  </div>
                  <div className="balance-page__video-model-stat">
                    <strong>{pricing.creditsPerSecond}</strong>
                    <span>{t('subscribe.points')} / {t('subscribe.videoPricingSecond')}</span>
                  </div>
                  <div className="balance-page__video-model-range">
                    {pricing.minDuration}-{pricing.maxDuration} {t('subscribe.videoPricingSecond')}
                  </div>
                  <div className="balance-page__video-model-capacity">
                    <strong>{capacity.toLocaleString()}</strong>
                    <span>{t('subscribe.videoPricingVideos')}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="balance-page__video-notes">
            <span>{t('subscribe.videoPricingSharedPoolDesc')}</span>
            <span>{t('subscribe.videoPricingActualNote')}</span>
          </div>
        </section>

        <section className="balance-page__section">
          <div className="balance-page__top-up-head">
            <div>
              <h2 className="balance-page__section-title">{t('balance.topUp')}</h2>
              <p className="balance-page__section-desc">{t('balance.topUpDesc')}</p>
            </div>
            <div className="balance-page__selected-plan">
              <span>{t('subscribe.selected')}</span>
              <strong>{t(`subscribe.planNames.${selectedPackage.tierId}`, {
                defaultValue: selectedPackage.displayName,
              })}</strong>
            </div>
          </div>

          <div className="balance-page__amounts">
            {PAYMENT_PLANS.map(plan => (
              <button
                key={plan.id}
                type="button"
                className={`balance-page__amount-btn ${selectedPlan === plan.id ? 'active' : ''}`}
                onClick={() => setSelectedPlan(plan.id)}
                aria-pressed={selectedPlan === plan.id}
              >
                <span className="balance-page__amount-cover">
                  <img
                    src={PLAN_COVER_IMAGES[plan.tierId] || plan.coverImage}
                    alt={t(`subscribe.planNames.${plan.tierId}`, { defaultValue: plan.displayName })}
                    loading="lazy"
                  />
                  <span>{plan.fastCredits.toLocaleString()} {t('subscribe.images')}</span>
                </span>
                <span className="balance-page__amount-body">
                  <span className="balance-page__amount-name">
                    {t(`subscribe.planNames.${plan.tierId}`, { defaultValue: plan.displayName })}
                    {plan.popular && <em>{t('subscribe.popular')}</em>}
                  </span>
                  <span className="balance-page__amount-price">
                    ¥{plan.price / 100}
                    <small>{t('subscribe.monthly')}</small>
                  </span>
                  <span className="balance-page__amount-allocation">
                    {plan.credits.toLocaleString()} {t('balance.points')}
                    {' · '}
                    {t('balance.imageEquivalent', { count: plan.fastCredits.toLocaleString() })}
                  </span>
                  <span className="balance-page__amount-video">
                    {t('subscribe.videoBudgetCount', {
                      count: getVideoCapacity(
                        plan.credits,
                        featuredVideoPricing,
                        VIDEO_SAMPLE_DURATION,
                      ).toLocaleString(),
                    })}
                    <small>
                      {t('subscribe.videoBudgetDesc', {
                        duration: VIDEO_SAMPLE_DURATION,
                        model: featuredVideoPricing.label,
                        credits: getVideoCost(featuredVideoPricing, VIDEO_SAMPLE_DURATION),
                      })}
                    </small>
                  </span>
                </span>
              </button>
            ))}
          </div>

          {error && (
            <div className="balance-page__error">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}

          <div className="balance-page__checkout">
            <div className="balance-page__checkout-info">
              <strong>{t(`subscribe.planNames.${selectedPackage.tierId}`, {
                defaultValue: selectedPackage.displayName,
              })} · ¥{selectedPackage.price / 100}{t('subscribe.monthly')}</strong>
              <small>
                {selectedPackage.credits.toLocaleString()} {t('balance.points')} · {t('subscribe.domesticPaymentHint')}
              </small>
            </div>
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
                t('balance.buyPackage') + ` ¥${selectedPackage.price / 100}`
              )}
            </button>
          </div>
        </section>

        <section className="balance-page__info-grid">
          <div className="balance-page__info-card">
            <div className="balance-page__info-icon">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 2l7 4v4c0 4-5 7-7 8-2-1-7-4-7-8V6l7-4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="balance-page__info-title">{t('balance.howWorks')}</div>
              <div className="balance-page__info-desc">{t('balance.howWorksDesc')}</div>
            </div>
          </div>
          <div className="balance-page__info-card">
            <div className="balance-page__info-icon">
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M10 6v5M10 13v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="balance-page__info-title">{t('balance.noExpiry')}</div>
              <div className="balance-page__info-desc">{t('balance.noExpiryDesc')}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
