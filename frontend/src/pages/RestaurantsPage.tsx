import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MAX_RESTAURANTS_PER_OWNER, UserRole } from '@ar-menu/shared';
import { analyticsApi } from '../api/analytics';
import { restaurantsApi } from '../api/restaurants';
import type { DashboardOverview, RestaurantOverview } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import { errorMessage } from '../lib/errors';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/useAuth';
import s from './RestaurantsPage.module.css';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Dashboard refresh cadence — counts change slowly (new dishes, models
// finishing QA).
const REFRESH_MS = 30_000;

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className={s.tile}>
      <span className={s.tileValue}>{value.toLocaleString()}</span>
      <span className={s.tileLabel}>{label}</span>
    </div>
  );
}

function RestaurantCard({ restaurant }: { restaurant: RestaurantOverview }) {
  const { statusCounts } = restaurant;
  const counts = [
    { label: 'Dishes', value: restaurant.dishes },
    { label: 'Live in AR', value: statusCounts.live },
    { label: 'In review', value: statusCounts.qa },
    { label: 'Generating', value: statusCounts.generating },
    { label: 'Need a model', value: statusCounts.pending },
  ];
  return (
    <li className={s.card}>
      <div className={s.cardHead}>
        <div>
          <h2 className={s.cardTitle}>{restaurant.name}</h2>
          <p className={s.cardSlug}>/{restaurant.slug}</p>
        </div>
      </div>

      <dl className={s.counts}>
        {counts.map((c) => (
          <div key={c.label} className={s.count}>
            <dt>{c.label}</dt>
            <dd>{c.value}</dd>
          </div>
        ))}
      </dl>

      <Link to={`/restaurants/${restaurant.slug}`} className={s.cardLink}>
        Manage menu →
      </Link>
    </li>
  );
}

/**
 * The signed-in user's dashboard (mango points 2): totals across all their
 * restaurants, then a card per restaurant with its dish/AR-status counts.
 * All figures come from one aggregated
 * API call (GET /dashboard/overview), scoped server-side to the user.
 */
export function RestaurantsPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [address, setAddress] = useState('');
  const [creating, setCreating] = useState(false);

  function load() {
    analyticsApi
      .overview()
      .then(setOverview)
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(load, []);

  // Background refresh; errors are left to the next tick.
  const refreshLive = useCallback(async () => {
    setOverview(await analyticsApi.overview());
  }, []);
  useLiveRefresh(refreshLive, { intervalMs: REFRESH_MS, enabled: overview !== null });

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await restaurantsApi.create({ name, slug, address });
      setName('');
      setSlug('');
      setSlugTouched(false);
      setAddress('');
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  // Mirrors the server-side cap (the API enforces it regardless).
  const canCreate =
    user?.role === UserRole.ADMIN ||
    (overview !== null && overview.restaurants.length < MAX_RESTAURANTS_PER_OWNER);

  return (
    <AppShell>
      <ErrorBanner message={error} />

      <div className={s.hero}>
        <div className={s.heroGlow} aria-hidden="true" />
        <span className={s.eyebrow}>
          <span className={s.eyebrowDot} aria-hidden="true" />
          Dashboard
        </span>
        <h1 className={s.heroTitle}>Your restaurants</h1>
        {overview && (
          <div className={s.tiles}>
            <StatTile label="Restaurants" value={overview.totals.restaurants} />
            <StatTile label="Dishes" value={overview.totals.dishes} />
            <StatTile label="Live in AR" value={overview.totals.live} />
            <StatTile label="In review" value={overview.totals.inReview} />
          </div>
        )}
      </div>

      {overview === null ? (
        <p className="page-loading">Loading…</p>
      ) : overview.restaurants.length === 0 ? (
        <div className={s.empty}>
          <strong>No restaurants yet</strong>
          Create your first one below.
        </div>
      ) : (
        <ul className={s.cards}>
          {overview.restaurants.map((r) => (
            <RestaurantCard key={r.id} restaurant={r} />
          ))}
        </ul>
      )}

      {canCreate && (
        <form className={`inline-form ${s.createForm}`} onSubmit={handleCreate}>
          <h2>Add a restaurant</h2>
          <label>
            Name
            <input
              value={name}
              maxLength={200}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              required
            />
          </label>
          <label>
            Slug
            <input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              pattern="[a-z0-9-]+"
              title="lowercase letters, numbers, and hyphens only"
              required
            />
          </label>
          <label>
            Address
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              minLength={5}
            />
          </label>
          <button type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create restaurant'}
          </button>
        </form>
      )}
    </AppShell>
  );
}
