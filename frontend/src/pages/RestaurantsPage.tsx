import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { restaurantsApi } from '../api/restaurants';
import type { Restaurant } from '../api/types';
import { ErrorBanner } from '../components/ErrorBanner';
import { errorMessage } from '../lib/errors';
import { AppShell } from '../components/AppShell';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [creating, setCreating] = useState(false);

  function load() {
    restaurantsApi
      .list()
      .then(setRestaurants)
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await restaurantsApi.create({ name, slug });
      setName('');
      setSlug('');
      setSlugTouched(false);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }

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
              <Link to={`/restaurants/${r.id}`}>
                <strong>{r.name}</strong>
                <span className="muted"> /{r.slug}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

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
        <button type="submit" disabled={creating}>
          {creating ? 'Creating…' : 'Create restaurant'}
        </button>
      </form>
    </AppShell>
  );
}
