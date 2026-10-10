import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { BILLING_PLANS } from '../../config/billingPlans';
import './Subscribe.css';

const PLAN_COVER_IMAGES = {
  starter: '/assets/pricing/starter-cover.jpg',
  standard: '/assets/pricing/standard-cover.jpg',
  premium: '/assets/pricing/premium-cover.jpg',
};

function getPlanFeatures(plan, t) {
  const imagePrice = Number(plan.imagePrice);
  return [
    t('subscribe.features.oneTime'),
    t('subscribe.features.points', { count: plan.credits.toLocaleString() }),
    t('subscribe.features.generations', { count: plan.fastCredits.toLocaleString() }),
    Number.isFinite(imagePrice)
      ? t('subscribe.features.imagePrice', { price: imagePrice.toFixed(2) })
      : null,
  ].filter(Boolean);
}

function normalizePlan(rawPlan = {}) {
  const price = Number(rawPlan.price);
  const creditsPerImage = Number(rawPlan.creditsPerImage || 5);
  const declaredCredits = Number(rawPlan.credits);
  const declaredFastCredits = Number(rawPlan.fastCredits);
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
  const declaredImagePrice = Number(rawPlan.imagePrice);
  const localPlan = BILLING_PLANS.find(plan => plan.id === rawPlan.id);
  const derivedImagePrice = Number.isFinite(declaredImagePrice)
    ? declaredImagePrice
    : Number.isFinite(price) && price > 0 && Number.isFinite(fastCredits) && fastCredits > 0
      ? (price / 100) / fastCredits
      : null;

  return {
    ...rawPlan,
    price: Number.isFinite(price) ? price : 0,
    credits: Number.isFinite(credits) ? credits : 0,
    creditsPerImage: Number.isFinite(creditsPerImage) ? creditsPerImage : 5,
    fastCredits: Number.isFinite(fastCredits) ? fastCredits : 0,
    imagePrice: Number.isFinite(derivedImagePrice) ? derivedImagePrice : null,
    domesticPaymentUrl: String(rawPlan.domesticPaymentUrl || localPlan?.domesticPaymentUrl || '').trim(),
    coverImage: rawPlan.coverImage || PLAN_COVER_IMAGES[rawPlan.tierId] || null,
    features: Array.isArray(rawPlan.features) ? rawPlan.features : [],
  };
}

function normalizePlans(rawPlans) {
  return Array.isArray(rawPlans) && rawPlans.length > 0
    ? rawPlans.map(normalizePlan)
    : BILLING_PLANS.map(normalizePlan);
}

export default function Subscribe() {
  const { t } = useTranslation();
  const { currentUser } = useApp();
  const [selectedPlan, setSelectedPlan] = useState('standard_cny');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [plans, setPlans] = useState(() => normalizePlans(BILLING_PLANS));

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
      .catch(() => {
        if (cancelled) return;
        const fallbackPlans = normalizePlans(BILLING_PLANS);
        setPlans(fallbackPlans);
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
      }
    } catch (err) {
      setError(err.message || t('billing.checkoutFailed'));
      setLoading(false);
    }
  };

  return (
    <div className="subscribe-page">
      <div className="subscribe-page__inner container">
        <div className="subscribe-page__header">
          <div className="subscribe-page__eyebrow">Pro</div>
          <h1 className="subscribe-page__title">{t('subscribe.title')}</h1>
          <p className="subscribe-page__subtitle">{t('subscribe.subtitle')}</p>
        </div>

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
              {plan.coverImage && (
                <div className="subscribe-card__cover">
                  <img
                    src={plan.coverImage}
                    alt={t(`subscribe.planNames.${plan.tierId}`, { defaultValue: plan.displayName })}
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
                    {(plan.price / 100).toFixed(0)}
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
              <div className="subscribe-card__credits">
                {plan.credits.toLocaleString()} {t('subscribe.points')}
              </div>
              <div className="subscribe-card__credits-note">
                {t('subscribe.imagesEquivalent', { count: plan.fastCredits.toLocaleString() })}
              </div>
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
