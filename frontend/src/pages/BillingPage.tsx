import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { billingApi } from '../api/billing';
import { restaurantsApi } from '../api/restaurants';
import type { Invoice, Restaurant, Subscription } from '../api/types';
import { AppShell } from '../components/AppShell';
import { ErrorBanner } from '../components/ErrorBanner';
import { useConfirm } from '../hooks/useConfirm';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { formatMinorUnits } from '../lib/billingFormat';
import type { BillingCurrency } from '../lib/billingFormat';
import { errorMessage } from '../lib/errors';
import s from './BillingPage.module.css';

// Payment confirmation arrives via the gateway webhook, not this page —
// poll so the "we're confirming your payment" state resolves on its own.
const REFRESH_MS = 15_000;

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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const loadSeq = useRef(0);

  function loadAll() {
    const seq = ++loadSeq.current;
    Promise.all([
      restaurantsApi.get(restaurantSlug),
      billingApi.getSubscription(restaurantSlug),
      billingApi.listInvoices(restaurantSlug),
    ])
      .then(([r, sub, inv]) => {
        if (seq !== loadSeq.current) return;
        setRestaurant(r);
        setSubscription(sub);
        setInvoices(inv);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(loadAll, [restaurantSlug]);

  const refreshLive = useCallback(async () => {
    const seq = ++loadSeq.current;
    const [sub, inv] = await Promise.all([
      billingApi.getSubscription(restaurantSlug),
      billingApi.listInvoices(restaurantSlug),
    ]);
    if (seq !== loadSeq.current) return;
    setSubscription(sub);
    setInvoices(inv);
  }, [restaurantSlug]);

  useLiveRefresh(refreshLive, { intervalMs: REFRESH_MS, enabled: restaurant !== null });

  async function handleCancel() {
    const confirmed = await confirm({
      title: 'Cancel your subscription?',
      message:
        'Your plan stays active until the end of the current billing period, then your dish links go offline.',
      confirmLabel: 'Cancel subscription',
    });
    if (!confirmed) return;
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

  const currency: BillingCurrency = subscription?.gateway === 'safepay' ? 'PKR' : 'USD';
  const hasActivePlan = subscription !== null && subscription.status !== 'canceled';
  const plansPath = `/restaurants/${restaurantSlug}/billing/plans`;

  const checkoutNotice = searchParams.get('checkout') ?? searchParams.get('renewal');

  return (
    <AppShell>
      {confirmDialog}
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
            <strong>Your menus are offline.</strong> Reactivate to bring your dish links back online
            immediately — nothing was deleted.
          </div>
        )}

        {hasActivePlan ? (
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
            <div className={s.planLinks}>
              <Link to={plansPath} className={s.changePlanLink}>
                Change package →
              </Link>
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
          </div>
        ) : (
          <p className={s.noSubscription}>
            No active subscription yet.{' '}
            <Link to={plansPath} className={s.changePlanLink}>
              Choose a package →
            </Link>
          </p>
        )}
      </div>

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
