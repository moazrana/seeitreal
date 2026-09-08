import { Link } from 'react-router-dom';
import styles from './landing.module.css';
import { Scene } from './Scene';

export function Hero() {
  return (
    <section id="top" className={styles.hero}>
      <div className={styles.heroCanvas}>
        <Scene />
        <div className={styles.heroScrim} aria-hidden="true" />
        <div className={`${styles.bracket} ${styles.bracketTl}`} aria-hidden="true" />
        <div className={`${styles.bracket} ${styles.bracketTr}`} aria-hidden="true" />
        <div className={`${styles.bracket} ${styles.bracketBl}`} aria-hidden="true" />
        <div className={`${styles.bracket} ${styles.bracketBr}`} aria-hidden="true" />
        <div className={styles.scanLine} aria-hidden="true" />
        <div className={styles.heroFade} aria-hidden="true" />
      </div>

      <div className={`${styles.container} ${styles.heroInner}`}>
        <p className={styles.heroPill}>
          <span className={styles.eyebrow}>Augmented reality for menus — and more</span>
        </p>

        <h1 className={styles.h1}>See it on the table before you order.</h1>

        <p className={styles.heroSub}>
          Diners point their phone at a QR code and see the real dish, true to size, sitting on
          their own table — no app to install. You upload a photo; we handle the 3D.
        </p>

        <div className={styles.heroActions}>
          <Link to="/signup" className={`${styles.btn} ${styles.btnPrimary}`}>
            Start free
          </Link>
          <a href="#how" className={`${styles.btn} ${styles.btnGhost}`}>
            See a live demo
          </a>
        </div>
      </div>

      <div className={styles.heroScroll} aria-hidden="true">
        <span>Scroll</span>
        <span className={styles.heroScrollLine} />
      </div>
    </section>
  );
}
