import styles from './landing.module.css';
import { useReveal } from './useReveal';

export function Features() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section
      id="features"
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.container}>
        <h2 className={styles.h2}>Built for the table, not a demo reel</h2>
        <p className={styles.sectionIntro}>
          Everything a menu needs to hold up in a real dining room, on a real phone.
        </p>

        <div className={styles.bento}>
          <article className={`${styles.bentoCard} ${styles.bentoHero}`}>
            <div className={styles.bentoGlow} aria-hidden="true" />
            <div className={styles.miniAr} aria-hidden="true">
              <svg
                className={styles.miniArGlyph}
                viewBox="0 0 48 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M8 16V10a2 2 0 0 1 2-2h6M40 16V10a2 2 0 0 0-2-2h-6M8 32v6a2 2 0 0 0 2 2h6M40 32v6a2 2 0 0 1-2 2h-6"
                  stroke="#2DD4BF"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M24 14l11 6.3v11.4L24 38l-11-6.3V20.3z"
                  stroke="#8B5CF6"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path d="M24 14v12M24 26l11-6.3M24 26l-11-6.3" stroke="#4D7CFF" strokeWidth="1.2" />
              </svg>
            </div>
            <h3 className={styles.bentoTitle}>Real size, not guesswork</h3>
            <p className={styles.bentoBody}>
              Every model is scaled to the dish's actual dimensions, so what a diner sees on the
              table is what arrives on the table.
            </p>
          </article>

          <article className={`${styles.bentoCard} ${styles.bentoWide}`}>
            <div className={styles.bentoGlow} aria-hidden="true" />
            <h3 className={styles.bentoTitle}>Works on every phone. No app.</h3>
            <p className={styles.bentoBody}>
              A QR code opens straight into the browser's own AR viewer — Scene Viewer on
              Android, Quick Look on iOS. Nothing to download, nothing to approve.
            </p>
          </article>

          <article className={`${styles.bentoCard} ${styles.bentoStandard}`}>
            <div className={styles.bentoGlow} aria-hidden="true" />
            <h3 className={styles.bentoTitle}>One dashboard. Full control.</h3>
            <p className={styles.bentoBody}>
              Add dishes, track scans, manage deals, and download QR codes — all from a single
              owner dashboard.
            </p>
          </article>

          <article className={`${styles.bentoCard} ${styles.bentoStatement}`}>
            <div className={styles.bentoGlow} aria-hidden="true" />
            <p className={styles.bentoBody}>
              You don't describe the dish. <span className={styles.gradText}>They see it real.</span>
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
