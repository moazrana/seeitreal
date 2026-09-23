import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorBanner } from '../components/ErrorBanner';
import { errorMessage } from '../lib/errors';
import { useAuth } from '../context/useAuth';
import { AuthLayout } from './auth/AuthLayout';
import styles from './auth/auth.module.css';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // UX-only check — the server re-validates this (spec §7.2: never trust
    // client-side validation).
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const restaurant = await signup({
        email,
        password,
        confirmPassword,
        businessName,
        address,
      });
      navigate(`/restaurants/${restaurant.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Start free"
      subtitle="Set up your restaurant in a few minutes."
      footer={
        <>
          Already have an account? <Link to="/login">Log in</Link>
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
            minLength={10}
            autoComplete="new-password"
          />
          <span className={styles.hint}>At least 10 characters, with a letter and a number.</span>
        </label>
        <label className={styles.field}>
          Confirm password
          <input
            className={styles.input}
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={10}
            autoComplete="new-password"
          />
        </label>
        <label className={styles.field}>
          Business name
          <input
            className={styles.input}
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            minLength={2}
            autoComplete="organization"
          />
        </label>
        <label className={styles.field}>
          Business type
          <input className={styles.input} type="text" value="Restaurant" disabled readOnly />
          <span className={styles.hint}>Only restaurants are supported right now.</span>
        </label>
        <label className={styles.field}>
          Address
          <input
            className={styles.input}
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            minLength={5}
            autoComplete="street-address"
          />
        </label>
        <button className={styles.submit} type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
    </AuthLayout>
  );
}
