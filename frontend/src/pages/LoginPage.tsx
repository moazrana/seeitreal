import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { restaurantsApi } from '../api/restaurants';
import { ErrorBanner } from '../components/ErrorBanner';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../context/useAuth';
import { AuthLayout } from './auth/AuthLayout';
import styles from './auth/auth.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      // One restaurant per account — go straight to it rather than
      // through the list page. Falls back to the list for an admin (sees
      // every restaurant) or a pre-existing owner with none/several yet.
      const restaurants = await restaurantsApi.list();
      navigate(restaurants.length === 1 ? `/restaurants/${restaurants[0].slug}` : '/restaurants');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to manage your menu."
      footer={
        <>
          No account? <Link to="/signup">Sign up</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <ErrorBanner message={error} />
        <label className={styles.field}>
          Email
          <input
            className={styles.input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label className={styles.field}>
          Password
          <input
            className={styles.input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </AuthLayout>
  );
}
