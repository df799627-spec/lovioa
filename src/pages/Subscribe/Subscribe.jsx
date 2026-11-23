import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { BILLING_PLANS, PAYMENT_PLANS, PAYMENT_PLAN_IDS } from '../../config/billingPlans';
import {
  VIDEO_BILLING_DEFAULTS,
  VIDEO_SAMPLE_DURATION,
  getVideoCapacity,
  getVideoCost,
} from '../../config/videoBilling';
import './Subscribe.css';

const PLAN_COVER_IMAGES = {
  starter: '/assets/pricing/starter-cover-v2.webp',
  standard: '/assets/pricing/standard-cover-v2.webp',
  advanced: '/assets/pricing/standard-cover-v2.webp',
  premium: '/assets/pricing/premium-cover-v2.webp',
};

function normalizeCredits(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (!raw || typeof raw !== 'object') return 0;
  if (typeof raw.totalCredits === 'number' && Number.isFinite(raw.totalCredits)) {
    return raw.totalCredits;
  }
  const free = Number(raw.freeCredits ?? raw.free_credits ?? 0);
  const paid = Number(raw.paidCredits ?? raw.paid_credits ?? 0);
  return Number.isFinite(free) && Number.isFinite(paid) ? free + paid : 0;
}

function formatPlanName(plan, t) {
  return t(`subscribe.planNames.${plan?.tierId}`, {
    defaultValue: plan?.displayName || t('subscribe.freePlan'),
  });
}

function positiveNumberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeVideoPricing(rawPricing) {
  const source = Array.isArray(rawPricing) && rawPricing.length > 0
    ? rawPricing
    : VIDEO_BILLING_DEFAULTS;
  return source
    .map(item => ({
      ...item,
      label: String(item.label || '').trim(),
      creditsPerSecond: positiveNumberOr(item.creditsPerSecond, 0),
      minDuration: positiveNumberOr(item.minDuration, 2),
      maxDuration: positiveNumberOr(item.maxDuration, 30),
      defaultDuration: positiveNumberOr(item.defaultDuration, VIDEO_SAMPLE_DURATION),
    }))
    .filter(item => item.label && item.creditsPerSecond > 0);
}

function getPlanFeatures(plan, t) {
  const imagePrice = Number(plan.imagePrice);
  return [
    plan.interval === 'month'
      ? t('subscribe.features.monthlyAllowance')
      : t('subscribe.features.oneTime'),
    t('subscribe.features.videoBilling'),
    Number.isFinite(imagePrice) && imagePrice > 0
      ? t('subscribe.features.imagePrice', { price: imagePrice.toFixed(2) })
      : null,
  ].filter(Boolean);
}

function normalizePlan(rawPlan = {}) {
  const localPlan = PAYMENT_PLANS.find(plan => plan.id === rawPlan.id);
  // Keep local pricing as the source of truth when an older API only returns
  // plan ids or a partial plan object.
  const source = { ...(localPlan || {}), ...rawPlan };
  const price = positiveNumberOr(source.price, positiveNumberOr(localPlan?.price, 0));
  const creditsPerImage = positiveNumberOr(source.creditsPerImage, localPlan?.creditsPerImage || 5);
  const declaredCredits = positiveNumberOr(source.credits, localPlan?.credits || 0);
  const declaredFastCredits = positiveNumberOr(source.fastCredits, localPlan?.fastCredits || 0);
  const credits = Number.isFinite(declaredCredits)
    ? declaredCredits
    : Number.isFinite(declaredFastCredits)
      ? declaredFastCredits * creditsPerImage
      : 0;
  const fastCredits = Number(
    Number.isFinite(declaredFastCredits)
      ? declaredFastCredits
      : Math.floor(credits / creditsPerImage),
  );
  const declaredImagePrice = positiveNumberOr(source.imagePrice, localPlan?.imagePrice || 0);
  const derivedImagePrice = Number.isFinite(declaredImagePrice)
    ? declaredImagePrice
    : Number.isFinite(price) && price > 0 && Number.isFinite(fastCredits) && fastCredits > 0
      ? (price / 100) / fastCredits
      : null;

  return {
    ...source,
    price: Number.isFinite(price) ? price : 0,
    credits: Number.isFinite(credits) ? credits : 0,
    creditsPerImage: Number.isFinite(creditsPerImage) ? creditsPerImage : 5,
    fastCredits: Number.isFinite(fastCredits) ? fastCredits : 0,
    imagePrice: Number.isFinite(derivedImagePrice) ? derivedImagePrice : null,
    domesticPaymentUrl: String(source.domesticPaymentUrl || localPlan?.domesticPaymentUrl || '').trim(),
    coverImage: PLAN_COVER_IMAGES[source.tierId] || source.coverImage || null,
    features: Array.isArray(source.features) ? source.features : [],
  };
}

function normalizePlans(rawPlans) {
  const remotePlans = Array.isArray(rawPlans)
    ? rawPlans.filter(plan => PAYMENT_PLAN_IDS.includes(plan?.id))
    : [];
  return (remotePlans.length > 0 ? remotePlans : PAYMENT_PLANS).map(normalizePlan);
}

export default function Subscribe() {
  const { t } = useTranslation();
  const { currentUser, credits } = useApp();
  const [selectedPlan, setSelectedPlan] = useState('standard_cny');
  const [loading, setLoading] = useState(false);
  const [manageLoading, setManageLoading] = useState(false);
  const [error, setError] = useState('');
  const [billingSnapshot, setBillingSnapshot] = useState(null);
  const [plans, setPlans] = useState(() => normalizePlans(PAYMENT_PLANS));
  const [videoPricing] = useState(() => (
    normalizeVideoPricing(VIDEO_BILLING_DEFAULTS)
  ));

  useEffect(() => {
    let cancelled = false;
    api.billingPlans()
      .then((remotePlans) => {
        if (cancelled) return;
        const nextPlans = normalizePlans(remotePlans);
        setPlans(nextPlans);
        setSelectedPlan(currentPlan => (
          nextPlans.some(plan => plan.id === currentPlan)
            ? currentPlan
            : (nextPlans.find(plan => plan.popular) || nextPlans[0]).id
        ));
      })
      .catch((error) => {
        if (cancelled) return;
        const fallbackPlans = normalizePlans(PAYMENT_PLANS);
        setPlans(fallbackPlans);
        setError(error?.message || '套餐信息加载失败，请刷新重试');
        setSelectedPlan(currentPlan => (
          fallbackPlans.some(plan => plan.id === currentPlan)
            ? currentPlan
            : (fallbackPlans.find(plan => plan.popular) || fallbackPlans[0]).id
        ));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return undefined;
    }

    let cancelled = false;
    api.billingBalance()
      .then((data) => {
        if (!cancelled) setBillingSnapshot(data);
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error?.message || '积分余额加载失败，请刷新重试');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const handleCheckout = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError('');
    try {
      const plan = plans.find(item => item.id === selectedPlan);
      if (plan?.domesticPaymentUrl) {
        window.location.assign(plan.domesticPaymentUrl);
        return;
      }
      const data = await api.billingCheckout(selectedPlan);
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(t('billing.checkoutFailed'));
      }
    } catch (err) {
      setError(err.message || t('billing.checkoutFailed'));
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    setManageLoading(true);
    setError('');
    try {
      const data = await api.billingPortal();
      if (data.url) {
        window.location.assign(data.url);
      } else {
        throw new Error(t('billing.portalFailed'));
      }
    } catch (err) {
      setError(err.message || t('billing.portalFailed'));
      setManageLoading(false);
    }
  };

  const domesticPlan = billingSnapshot?.domesticPlan;
  const activePlanId = billingSnapshot?.subscription?.plan
    || domesticPlan?.id
    || null;
  const activePlanFallback = activePlanId
    ? BILLING_PLANS.find(plan => plan.id === activePlanId)
    : null;
  const activePlan = plans.find(plan => plan.id === activePlanId)
    || (activePlanFallback ? normalizePlan(activePlanFallback) : null);
  const availableCredits = billingSnapshot
    ? normalizeCredits(billingSnapshot.balance)
    : credits;
  const isStripeSubscription = Boolean(billingSnapshot?.subscription?.stripeSubscriptionId);
  const accountDate = billingSnapshot?.subscription?.currentPeriodEnd
    || domesticPlan?.redeemedAt;
  const selectedPlanDetails = plans.find(plan => plan.id === selectedPlan) || plans[0];
  const featuredVideoPricing = videoPricing.find(video => video.model === 'video_h3')
    || videoPricing[0];

  return (
    <div className="subscribe-page">
      <div className="subscribe-page__inner container">
        <div className="subscribe-page__header">
          <div className="subscribe-page__eyebrow">LOVIOA MEMBERSHIP</div>
          <h1 className="subscribe-page__title">{t('subscribe.title')}</h1>
          <p className="subscribe-page__subtitle">{t('subscribe.subtitle')}</p>
        </div>

        {currentUser && (
          <section className="subscribe-page__account" aria-label={t('subscribe.currentPlan')}>
            <div className="subscribe-page__account-main">
              <div className="subscribe-page__account-kicker">{t('subscribe.currentPlan')}</div>
              <div className="subscribe-page__account-name">
                {activePlan ? formatPlanName(activePlan, t) : t('subscribe.freePlan')}
              </div>
              <div className="subscribe-page__account-status">
                {billingSnapshot?.subscription
                  ? t('subscribe.activeSubscription')
                  : domesticPlan
                    ? t('subscribe.redeemedPlan')
                    : t('subscribe.noPlan')}
                {accountDate && (
                  <span>
                    {' · '}
                    {billingSnapshot?.subscription
                      ? t('subscribe.activeUntil', {
                        date: new Date(accountDate).toLocaleDateString(),
                      })
                      : t('subscribe.redeemedAt', {
                        date: new Date(accountDate).toLocaleDateString(),
                      })}
                  </span>
                )}
              </div>
            </div>
            <div className="subscribe-page__account-balance">
              <div className="subscribe-page__account-kicker">{t('subscribe.availableCredits')}</div>
              <div className="subscribe-page__account-credits">
                {availableCredits.toLocaleString()}
                <span>{t('subscribe.points')}</span>
              </div>
              <div className="subscribe-page__account-note">
                {t('subscribe.imageEquivalentShort', {
                  count: Math.floor(availableCredits / 5).toLocaleString(),
                })}
              </div>
            </div>
            <div className="subscribe-page__account-actions">
              <Link className="subscribe-page__account-link" to="/balance">
                {t('subscribe.viewBalance')}
              </Link>
              {isStripeSubscription && (
                <button
                  type="button"
                  className="subscribe-page__manage-btn"
                  onClick={handleManageSubscription}
                  disabled={manageLoading}
                >
                  {manageLoading ? t('subscribe.processing') : t('subscribe.manageSubscription')}
                </button>
              )}
            </div>
          </section>
        )}

        <div className="subscribe-page__usage">
          <div className="subscribe-page__usage-item">
            <span className="subscribe-page__usage-icon">01</span>
            <div>
              <strong>{t('subscribe.usageImageTitle')}</strong>
              <span>{t('subscribe.usageImageDesc')}</span>
            </div>
          </div>
          <div className="subscribe-page__usage-item">
            <span className="subscribe-page__usage-icon">02</span>
            <div>
              <strong>{t('subscribe.usageVideoTitle')}</strong>
              <span>{t('subscribe.usageVideoDesc')}</span>
            </div>
          </div>
          <div className="subscribe-page__usage-item">
            <span className="subscribe-page__usage-icon">03</span>
            <div>
              <strong>{t('subscribe.usagePeriodTitle')}</strong>
              <span>{t('subscribe.usagePeriodDesc')}</span>
            </div>
          </div>
        </div>

        <section className="subscribe-page__video-pricing">
          <div className="subscribe-page__video-pricing-header">
            <div>
              <div className="subscribe-page__video-eyebrow">VIDEO CREDITS</div>
              <h2>{t('subscribe.videoPricingTitle')}</h2>
            </div>
            <p>{t('subscribe.videoPricingSubtitle')}</p>
          </div>

          <div className="subscribe-page__video-table-wrap">
            <table className="subscribe-page__video-table">
              <thead>
                <tr>
                  <th>{t('subscribe.videoPricingModel')}</th>
                  <th>{t('subscribe.videoPricingPerSecond')}</th>
                  <th>{t('subscribe.videoPricingSample')}</th>
                  <th>{t('subscribe.videoPricingRange')}</th>
                  <th>
                    {selectedPlanDetails
                      ? t('subscribe.videoPricingPlanEstimate', {
                        plan: formatPlanName(selectedPlanDetails, t),
                      })
                      : t('subscribe.videoPricingEstimate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {videoPricing.map(pricing => {
                  const sampleCost = getVideoCost(pricing, VIDEO_SAMPLE_DURATION);
                  const capacity = getVideoCapacity(
                    selectedPlanDetails?.credits,
                    pricing,
                    VIDEO_SAMPLE_DURATION,
                  );
                  return (
                    <tr key={pricing.model}>
                      <td>
                        <strong>{pricing.label}</strong>
                        <small>{pricing.model}</small>
                      </td>
                      <td>
                        <strong>{pricing.creditsPerSecond}</strong>
                        <span>{t('subscribe.points')} / {t('subscribe.videoPricingSecond')}</span>
                      </td>
                      <td>
                        <strong>{sampleCost}</strong>
                        <span>{t('subscribe.points')}</span>
                      </td>
                      <td>
                        {pricing.minDuration}-{pricing.maxDuration} {t('subscribe.videoPricingSecond')}
                      </td>
                      <td>
                        <strong>{capacity.toLocaleString()}</strong>
                        <span>{t('subscribe.videoPricingVideos')}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="subscribe-page__video-notes">
            <div>
              <strong>{t('subscribe.videoPricingSharedPool')}</strong>
              <span>{t('subscribe.videoPricingSharedPoolDesc')}</span>
            </div>
            <div>
              <strong>{t('subscribe.videoPricingEstimateNote')}</strong>
              <span>{t('subscribe.videoPricingActualNote')}</span>
            </div>
          </div>
        </section>

        <div className="subscribe-page__plans">
          {plans.map(plan => (
            <div
              key={plan.id}
              className={`subscribe-card ${selectedPlan === plan.id ? 'subscribe-card--selected' : ''}`}
              onClick={() => setSelectedPlan(plan.id)}
            >
              {plan.popular && (
                <div className="subscribe-card__badge">{t('subscribe.popular')}</div>
              )}
              {activePlanId === plan.id && (
                <div className="subscribe-card__current">{t('subscribe.currentPlan')}</div>
              )}
              {plan.coverImage && (
                <div className="subscribe-card__cover">
                  <img
                    src={plan.coverImage}
                    alt={formatPlanName(plan, t)}
                    loading="lazy"
                  />
                  <div className="subscribe-card__cover-overlay">
                    <span>{plan.fastCredits.toLocaleString()} {t('subscribe.images')}</span>
                  </div>
                </div>
              )}
              <div className="subscribe-card__header">
                <div className="subscribe-card__name">
                  {t(`subscribe.planNames.${plan.tierId}`, { defaultValue: plan.displayName })}
                </div>
                <div className="subscribe-card__price-wrap">
                  <span className="subscribe-card__currency">¥</span>
                  <span className="subscribe-card__amount">
                    {(plan.price / 100).toFixed(plan.price % 100 === 0 ? 0 : 2)}
                  </span>
                  <span className="subscribe-card__period">
                    {plan.interval === 'month'
                      ? t('subscribe.monthly')
                      : plan.interval === 'year'
                        ? t('subscribe.yearly')
                        : t('subscribe.oneTime')}
                  </span>
                </div>
                {plan.imagePrice != null && (
                  <div className="subscribe-card__yearly-total">
                    {t('subscribe.imagePrice', { price: plan.imagePrice.toFixed(2) })}
                  </div>
                )}
                <div className="subscribe-card__allocation">
                  <div>
                    <strong>{plan.credits.toLocaleString()}</strong>
                    <span>{t('subscribe.points')}</span>
                  </div>
                  <div>
                    <strong>{plan.fastCredits.toLocaleString()}</strong>
                    <span>{t('subscribe.images')}</span>
                  </div>
                </div>
                <div className="subscribe-card__credits-note">
                  {t('subscribe.imageEquivalentShort', {
                    count: plan.fastCredits.toLocaleString(),
                  })}
                </div>
                {featuredVideoPricing && (
                  <div className="subscribe-card__video-budget">
                    <div className="subscribe-card__video-budget-head">
                      <span>{t('subscribe.videoBudgetTitle')}</span>
                      <strong>
                        {t('subscribe.videoBudgetCount', {
                          count: getVideoCapacity(
                            plan.credits,
                            featuredVideoPricing,
                            VIDEO_SAMPLE_DURATION,
                          ).toLocaleString(),
                        })}
                      </strong>
                    </div>
                    <span>
                      {t('subscribe.videoBudgetDesc', {
                        duration: VIDEO_SAMPLE_DURATION,
                        model: featuredVideoPricing.label,
                        credits: getVideoCost(featuredVideoPricing, VIDEO_SAMPLE_DURATION),
                      })}
                    </span>
                  </div>
                )}
              </div>
              <ul className="subscribe-card__benefits">
                {getPlanFeatures(plan, t).map((benefit, i) => (
                  <li key={i} className="subscribe-card__benefit">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <circle cx="7" cy="7" r="7" fill="var(--color-accent)" opacity="0.15"/>
                      <path d="M4 7l2 2 4-4" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {benefit}
                  </li>
                ))}
              </ul>
              <button
                className={`subscribe-card__select-btn ${selectedPlan === plan.id ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setSelectedPlan(plan.id); }}
              >
                {selectedPlan === plan.id ? t('subscribe.selected') : t('subscribe.select')}
              </button>
            </div>
          ))}
        </div>

        {error && (
          <div className="subscribe-page__error">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="#dc2626" strokeWidth="1.5"/>
              <path d="M8 5v3M8 10.5v.5" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {error}
          </div>
        )}

        <div className="subscribe-page__action">
          <button
            className="subscribe-page__checkout-btn"
            onClick={handleCheckout}
            disabled={loading || !currentUser || plans.length === 0}
          >
            {loading ? (
              <>
                <span className="subscribe-page__spinner" />
                {t('subscribe.processing')}
              </>
            ) : (
              currentUser ? t('subscribe.buyNow') : t('subscribe.signInToSubscribe')
            )}
          </button>
          <p className="subscribe-page__guarantee">{t('subscribe.guarantee')}</p>
          <p className="subscribe-page__payment-hint">{t('subscribe.domesticPaymentHint')}</p>
          <Link
            className="subscribe-page__redeem-link"
            to={currentUser ? '/redeem' : '/auth'}
          >
            {t('subscribe.redeemAfterPayment')}
          </Link>
        </div>

      </div>
    </div>
  );
}
