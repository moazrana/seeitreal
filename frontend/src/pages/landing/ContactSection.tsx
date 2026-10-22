import { useState } from 'react';
import type { FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import styles from './landing.module.css';
import { useReveal } from './useReveal';

type Status = 'idle' | 'sending' | 'sent' | 'error';

const PHOTO_POINTS = [
  'Professional product & food photography',
  'We handle the 3D — from photos to a live AR model',
  'Guidance on getting the best AR results',
];

// Mirrors the server DTO (CreateContactEnquiryDto) for UX only — the
// server re-validates everything (spec §7.2).
const LIMITS = { name: 100, email: 254, businessName: 200, messageMin: 10, message: 5000 };

function errorText(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return 'You’ve sent a few messages already — please try again in a little while.';
  }
  if (err instanceof ApiError && err.status === 400) {
    return 'Please check the form — something doesn’t look right.';
  }
  return 'Sorry, we couldn’t send your message. Please try again.';
}

/**
 * Photography-help offer beside the contact form (documents/
 * TASK-home-page-content.md §4–5). The form POSTs to /api/contact, which
 * emails the enquiry server-side — no email address or API key lives in
 * the browser. A visually hidden honeypot field catches naive bots.
 */
export function ContactSection() {
  const { ref, visible } = useReveal<HTMLElement>();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const field = (key: string) => String(form.get(key) ?? '').trim();
    setStatus('sending');
    setError(null);
    try {
      await api.post('/contact', {
        name: field('name'),
        email: field('email'),
        businessName: field('businessName') || undefined,
        message: field('message'),
        website: field('website') || undefined,
      });
      formEl.reset();
      setStatus('sent');
    } catch (err) {
      setError(errorText(err));
      setStatus('error');
    }
  }

  return (
    <section
      id="contact"
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={`${styles.container} ${styles.contactGrid}`}>
        <div className={styles.photoHelp}>
          <h2 className={styles.h2}>Don’t know how to photograph your products?</h2>
          <p className={styles.photoHelpBody}>
            No problem. Our expert team can capture your dishes and products for you — so every 3D
            model looks its best. Tell us what you need and we’ll take it from there.
          </p>
          <ul className={styles.photoHelpPoints}>
            {PHOTO_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <a href="#contact-form" className={`${styles.btn} ${styles.btnPrimary}`}>
            Tell us what you need
          </a>
        </div>

        <form
          id="contact-form"
          className={styles.contactForm}
          onSubmit={(e) => void handleSubmit(e)}
          aria-labelledby="contact-form-title"
        >
          <h3 id="contact-form-title" className={styles.contactTitle}>
            Get in touch
          </h3>

          <label className={styles.contactField}>
            Name
            <input name="name" required maxLength={LIMITS.name} autoComplete="name" />
          </label>
          <label className={styles.contactField}>
            Email
            <input
              name="email"
              type="email"
              required
              maxLength={LIMITS.email}
              autoComplete="email"
            />
          </label>
          <label className={styles.contactField}>
            Business name <span className={styles.optional}>(optional)</span>
            <input name="businessName" maxLength={LIMITS.businessName} autoComplete="organization" />
          </label>
          <label className={styles.contactField}>
            Message
            <textarea
              name="message"
              required
              minLength={LIMITS.messageMin}
              maxLength={LIMITS.message}
              rows={5}
            />
          </label>

          {/* Honeypot: hidden from people and assistive tech; bots fill it. */}
          <div className={styles.honeypot} aria-hidden="true">
            <label>
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <button
            type="submit"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={status === 'sending'}
          >
            {status === 'sending' ? 'Sending…' : 'Send message'}
          </button>

          <p className={styles.contactStatus} role="status" aria-live="polite">
            {status === 'sent' && 'Thanks — your message is on its way. We’ll get back to you soon.'}
            {status === 'error' && <span className={styles.contactError}>{error}</span>}
          </p>
        </form>
      </div>
    </section>
  );
}
