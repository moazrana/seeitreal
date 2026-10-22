import { Link } from 'react-router-dom';
import styles from './landing.module.css';
import { useReveal } from './useReveal';

export function CtaBand() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section
      id="start"
      ref={ref}
      className={`${styles.section} ${styles.ctaBand} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.container}>
        <div className={styles.ctaPanel}>
          <div className={styles.ctaGlow} aria-hidden="true" />
          <h2 className={styles.h2}>Ready to let customers see it real?</h2>
          <Link to="/signup" className={`${styles.btn} ${styles.btnPrimary}`}>
            Start free
          </Link>
        </div>
      </div>
    </section>
  );
}
