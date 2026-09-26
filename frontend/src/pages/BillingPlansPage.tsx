import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { billingApi } from '../api/billing';
import type { PromoPreview, Subscription, SubscriptionPackage } from '../api/types';
import { AppShell } from '../components/AppShell';
import { ErrorBanner } from '../components/ErrorBanner';
import { currencyForCountry, formatMinorUnits } from '../lib/billingFormat';
import type { BillingCurrency } from '../lib/billingFormat';
import { errorMessage } from '../lib/errors';
import s from './BillingPage.module.css';

/**
 * Package picker, split out of the billing overview so the overview only
 * shows the current plan and invoices; owners reach this page from its
 * "Change package" / "Choose a package" link.
 */
export function BillingPlansPage() {
  const { slug: restaurantSlug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [billingCountry, setBillingCountry] = useState('PK');
  const [promoCode, setPromoCode] = useState('');
  const [promoPreview, setPromoPreview] = useState<PromoPreview | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      billingApi.getSubscription(restaurantSlug),
      billingApi.listPackages(),
      billingApi.defaultCountry(),
    ])
      .then(([sub, pkgs, country]) => {
        setSubscription(sub);
        setPackages(pkgs);
        setBillingCountry(country.country);
        setLoaded(true);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [restaurantSlug]);

  const hasActivePlan = subscription !== null && subscription.status !== 'canceled';
  const currency: BillingCurrency = subscription
    ? subscription.gateway === 'safepay'
      ? 'PKR'
      : 'USD'
    : currencyForCountry(billingCountry);

  async function handleValidatePromo() {
    setPromoError(null);
    setPromoPreview(null);
    if (!promoCode.trim()) return;
    try {
      const preview = await billingApi.validatePromo(promoCode.trim().toUpperCase(), 'subscription');
      setPromoPreview(preview);
    } catch (err) {
      setPromoError(errorMessage(err));
    }
  }

  async function handleSubscribe(packageId: number, e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { checkoutUrl } = await billingApi.checkout(restaurantSlug, {
        packageId,
        billingCountry,
        promoCode: promoPreview ? promoCode.trim().toUpperCase() : undefined,
      });
      window.location.href = checkoutUrl;
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function handleChangePackage(packageId: number) {
    setError(null);
    setBusy(true);
    try {
      await billingApi.changePackage(restaurantSlug, packageId);
      navigate(`/restaurants/${restaurantSlug}/billing`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <ErrorBanner message={error} />

      <div className={s.hero}>
        <div className={s.heroGlow} aria-hidden="true" />
        <Link to={`/restaurants/${restaurantSlug}/billing`} className={s.backLink}>
          ← Billing
        </Link>
        <span className={s.eyebrow}>
          <span className={s.eyebrowDot} aria-hidden="true" />
          Packages
        </span>
        <h1 className={s.heroTitle}>{hasActivePlan ? 'Change package' : 'Choose a package'}</h1>
      </div>

      <section className={s.section}>
        {loaded && !hasActivePlan && (
          <div className={s.checkoutForm}>
            <label className={s.field}>
              Billing country (2-letter code)
              <input
                value={billingCountry}
                maxLength={2}
                pattern="[A-Za-z]{2}"
                onChange={(e) => setBillingCountry(e.target.value.toUpperCase())}
                placeholder="PK"
              />
            </label>
            <div className={s.promoRow}>
              <label className={s.field}>
                Promo code (optional)
                <input
                  value={promoCode}
                  maxLength={50}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    setPromoPreview(null);
                    setPromoError(null);
                  }}
                  placeholder="SAVE10"
                />
              </label>
              <button type="button" className={s.actionBtn} onClick={() => void handleValidatePromo()}>
                Apply
              </button>
            </div>
            {promoError && <p className={s.promoError}>{promoError}</p>}
            {promoPreview && (
              <p className={s.promoApplied}>
                "{promoPreview.code}" applied —{' '}
                {promoPreview.discountType === 'percent'
                  ? `${promoPreview.amount}% off`
                  : `${formatMinorUnits(promoPreview.amount, promoPreview.currency ?? currency)} off`}
              </p>
            )}
          </div>
        )}

        {loaded && packages.length === 0 && (
          <div className={s.emptyCard}>
            <strong>No packages available right now</strong>
            Please check back soon or contact support.
          </div>
        )}

        <ul className={s.grid}>
          {packages.map((pkg) => {
            const isCurrent = hasActivePlan && subscription.packageId === pkg.id;
            return (
              <li key={pkg.id} className={s.planCard} data-current={isCurrent || undefined}>
                <h3 className={s.planName}>{pkg.name}</h3>
                <p className={s.planPrice}>
                  {formatMinorUnits(currency === 'PKR' ? pkg.pricePkr : pkg.priceUsd, currency)}
                  <span className={s.planInterval}>/{pkg.interval}</span>
                </p>
                <p className={s.planLimit}>
                  {pkg.maxItems ? `Up to ${pkg.maxItems} items` : 'Unlimited items'}
                </p>
                {isCurrent ? (
                  <span className={s.planCurrentBadge}>Current plan</span>
                ) : hasActivePlan ? (
                  <button
                    type="button"
                    className={`${s.actionBtn} ${s.actionBtnPrimary}`}
                    disabled={busy}
                    onClick={() => void handleChangePackage(pkg.id)}
                  >
                    Switch to this plan
                  </button>
                ) : (
                  <form onSubmit={(e) => void handleSubscribe(pkg.id, e)}>
                    <button
                      type="submit"
                      className={`${s.actionBtn} ${s.actionBtnPrimary}`}
                      disabled={busy || !loaded}
                    >
                      Subscribe
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
