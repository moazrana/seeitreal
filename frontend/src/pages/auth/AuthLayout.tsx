import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import styles from './auth.module.css';

/**
 * Shared shell for Login/Signup — the dark, gradient-accented look of the
 * marketing landing page (documents/seeitreal-design-spec.md), so moving
 * between "/" and these pages feels like one product instead of a jump
 * from a dark marketing site into a plain light form.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** The "No account? Sign up" / "Already have an account? Log in" line. */
  footer: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />

      <Link to="/" className={styles.wordmark}>
        <img src="/logo.svg" alt="" className={styles.wordmarkGlyph} />
        See<span className={styles.gradText}>ItReal</span>
      </Link>

      <div className={styles.cardWrap}>
        <div className={`${styles.bracket} ${styles.bracketTl}`} aria-hidden="true" />
        <div className={`${styles.bracket} ${styles.bracketBr}`} aria-hidden="true" />

        <div className={styles.card}>
          <div className={styles.scanLine} aria-hidden="true" />

          <div className={styles.heading}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>

          {children}

          <p className={styles.switch}>{footer}</p>
        </div>
      </div>

      <p className={styles.footerNote}>see it in your space before you decide.</p>
    </div>
  );
}
