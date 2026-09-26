import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserRole } from '@ar-menu/shared';
import { restaurantsApi } from '../api/restaurants';
import type { Restaurant } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { errorMessage } from '../lib/errors';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../context/useAuth';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function RestaurantsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [address, setAddress] = useState('');
  const [creating, setCreating] = useState(false);

  function load() {
    restaurantsApi
      .list()
      .then(setRestaurants)
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(load, []);

  // One restaurant per account: an owner with their one restaurant goes
  // straight to it instead of landing on this list (bookmarks, the
  // AppShell logo link, or a fresh login all route here first). Owners
  // with more than one are pre-existing accounts from before this rule —
  // shown the list rather than picked for, since collapsing to one would
  // hide the others.
  useEffect(() => {
    if (user?.role === UserRole.OWNER && restaurants?.length === 1) {
      navigate(`/restaurants/${restaurants[0].slug}`, { replace: true });
    }
  }, [user, restaurants, navigate]);

  const isSoleOwnerRestaurant = user?.role === UserRole.OWNER && restaurants?.length === 1;

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

  // Redirecting away — render nothing rather than flashing the list/form.
  if (isSoleOwnerRestaurant) {
    return null;
  }

  // An owner can only ever create one restaurant; once they have any,
  // the form above is moot (and they've already been redirected away if
  // they have exactly one). Admins always see it, to set restaurants up
  // for testing/support.
  const canCreate = user?.role === UserRole.ADMIN || restaurants?.length === 0;

  return (
    <AppShell>
      <h1>Your restaurants</h1>
      <ErrorBanner message={error} />

      {restaurants === null ? (
        <p>Loading…</p>
      ) : restaurants.length === 0 ? (
        <p className="empty-state">No restaurants yet — create your first one below.</p>
      ) : (
        <ul className="card-list">
          {restaurants.map((r) => (
            <li key={r.id} className="card-list-item">
              <Link to={`/restaurants/${r.slug}`}>
                <strong>{r.name}</strong>
                <span className="muted"> /{r.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <form className="inline-form" onSubmit={handleCreate}>
          <h2>Add a restaurant</h2>
          <label>
            Name
            <input
              value={name}
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
