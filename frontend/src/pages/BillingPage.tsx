import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { billingApi } from '../api/billing';
import { restaurantsApi } from '../api/restaurants';
import type {
  Invoice,
  PromoPreview,
  Restaurant,
  Subscription,
  SubscriptionPackage,
} from '../api/types';
import { AppShell } from '../components/AppShell';
import { ErrorBanner } from '../components/ErrorBanner';
import { errorMessage } from '../lib/errors';
import s from './BillingPage.module.css';

function currencyForCountry(country: string): 'PKR' | 'USD' {
  return country.toUpperCase() === 'PK' ? 'PKR' : 'USD';
}

function formatMinorUnits(amount: number, currency: 'PKR' | 'USD'): string {
  return new Intl.NumberFormat(currency === 'PKR' ? 'en-PK' : 'en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function BillingPage() {
  const { slug: restaurantSlug = '' } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [packages, setPackages] = useState<SubscriptionPackage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [billingCountry, setBillingCountry] = useState('PK');
  const [promoCode, setPromoCode] = useState('');
  const [promoPreview, setPromoPreview] = useState<PromoPreview | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  function loadAll() {
    Promise.all([
      restaurantsApi.get(restaurantSlug),
      billingApi.getSubscription(restaurantSlug),
      billingApi.listInvoices(restaurantSlug),
      billingApi.listPackages(),
      billingApi.defaultCountry(),
    ])
      .then(([r, sub, inv, pkgs, country]) => {
        setRestaurant(r);
        setSubscription(sub);
        setInvoices(inv);
        setPackages(pkgs);
        setBillingCountry(country.country);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(loadAll, [restaurantSlug]);

  async function handleValidatePromo() {
    setPromoError(null);
    setPromoPreview(null);
    if (!promoCode.trim()) return;
    try {
      const preview = await billingApi.validatePromo(
        promoCode.trim().toUpperCase(),
        'subscription',
      );
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
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setError(null);
    setBusy(true);
    try {
      await billingApi.cancel(restaurantSlug);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const currency: 'PKR' | 'USD' = subscription
    ? subscription.gateway === 'safepay'
      ? 'PKR'
      : 'USD'
    : currencyForCountry(billingCountry);

  const checkoutNotice = searchParams.get('checkout') ?? searchParams.get('renewal');

  return (
    <AppShell>
      <ErrorBanner message={error} />

      <div className={s.hero}>
        <div className={s.heroGlow} aria-hidden="true" />
        <Link to={`/restaurants/${restaurantSlug}`} className={s.backLink}>
          ← {restaurant?.name ?? 'Restaurant'}
        </Link>
        <span className={s.eyebrow}>
          <span className={s.eyebrowDot} aria-hidden="true" />
          Billing
        </span>
        <h1 className={s.heroTitle}>Subscription</h1>

        {checkoutNotice === 'success' && (
          <p className={s.checkoutNotice}>
            Thanks — we're confirming your payment. This page updates automatically once the gateway
            notifies us.
          </p>
        )}

        {subscription && subscription.status === 'past_due' && subscription.graceUntil && (
          <div className="status-banner banner-warning">
            <strong>Payment failed.</strong> Update your payment method within{' '}
            {daysUntil(subscription.graceUntil)} day(s), or your dish links will go offline.
          </div>
        )}
        {subscription && subscription.status === 'expired' && (
          <div className="status-banner banner-expired">
            <strong>Your menus are offline.</strong> Reactivate below to bring your dish links back
            online immediately — nothing was deleted.
          </div>
        )}

        {subscription && subscription.status !== 'canceled' ? (
          <div className={s.currentPlan}>
            <div>
              <span className={s.currentPlanLabel}>Current plan</span>
              <span className={s.currentPlanName}>{subscription.package.name}</span>
            </div>
            <div>
              <span className={s.currentPlanLabel}>Price</span>
              <span className={s.currentPlanValue}>
                {formatMinorUnits(
                  currency === 'PKR'
                    ? subscription.package.pricePkr
                    : subscription.package.priceUsd,
                  currency,
                )}{' '}
                / {subscription.package.interval}
              </span>
            </div>
            <div>
              <span className={s.currentPlanLabel}>Renews</span>
              <span className={s.currentPlanValue}>
                {formatDate(subscription.currentPeriodEnd)}
              </span>
            </div>
            {subscription.status === 'active' && (
              <button
                type="button"
                className={s.cancelLink}
                disabled={busy}
                onClick={() => void handleCancel()}
              >
                Cancel subscription
              </button>
            )}
          </div>
        ) : (
          <p className={s.noSubscription}>No active subscription yet — choose a plan below.</p>
        )}
      </div>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2>
            {subscription && subscription.status !== 'canceled' ? 'Change plan' : 'Choose a plan'}
          </h2>
        </div>

        {!subscription || subscription.status === 'canceled' ? (
          <div className={s.checkoutForm}>
            <label className={s.field}>
              Billing country (2-letter code)
              <input
                value={billingCountry}
                maxLength={2}
                onChange={(e) => setBillingCountry(e.target.value.toUpperCase())}
                placeholder="PK"
              />
            </label>
            <div className={s.promoRow}>
              <label className={s.field}>
                Promo code (optional)
                <input
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    setPromoPreview(null);
                    setPromoError(null);
                  }}
                  placeholder="SAVE10"
                />
              </label>
              <button
                type="button"
                className={s.actionBtn}
                onClick={() => void handleValidatePromo()}
              >
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
        ) : null}

        <ul className={s.grid}>
          {packages.map((pkg) => {
            const isCurrent =
              subscription?.status !== 'canceled' && subscription?.packageId === pkg.id;
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
                ) : subscription && subscription.status !== 'canceled' ? (
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
                      disabled={busy}
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

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2>Invoices</h2>
        </div>
        {invoices.length === 0 ? (
          <div className={s.emptyCard}>
            <strong>No invoices yet</strong>
            Charges will appear here once your first payment is processed.
          </div>
        ) : (
          <table className={s.invoiceTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{formatDate(inv.createdAt)}</td>
                  <td>{inv.type.replace('_', ' ')}</td>
                  <td>{inv.amount}</td>
                  <td>
                    <span className={s.invoiceStatus} data-status={inv.status}>
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}
