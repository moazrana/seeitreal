import { useState } from 'react';
import { Link } from 'react-router-dom';
import styles from './landing.module.css';
import { useScrolled } from './useScrolled';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  // No dedicated pricing section yet — points at the CTA band where
  // signup (and, later, plan selection) happens.
  { href: '#start', label: 'Pricing' },
];

export function Nav() {
  const scrolled = useScrolled(20);
  const [open, setOpen] = useState(false);

  return (
    <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ''}`}>
      <div className={styles.navInner}>
        <a href="#top" className={styles.wordmark}>
          <img src="/logo.svg" alt="" className={styles.wordmarkGlyph} />
          See<span className={styles.gradText}>ItReal</span>
        </a>

        <nav
          className={`${styles.navLinks} ${open ? styles.navLinksOpen : ''}`}
          aria-label="Primary"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={styles.navLink}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className={styles.navCta}>
          <Link to="/signup" className={`${styles.btn} ${styles.btnPrimary}`}>
            Start free
          </Link>
          <button
            type="button"
            className={styles.navToggle}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              {open ? (
                <path
                  d="M4 4L14 14M14 4L4 14"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M2 5H16M2 9H16M2 13H16"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}
