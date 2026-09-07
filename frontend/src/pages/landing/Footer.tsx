import styles from './landing.module.css';

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerInner}`}>
        <span className={styles.footerWordmark}>
          See<span className={styles.gradText}>ItReal</span>
        </span>
        <p>see it in your space before you decide.</p>
      </div>
    </footer>
  );
}
