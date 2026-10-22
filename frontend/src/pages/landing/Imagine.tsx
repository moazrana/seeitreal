import styles from './landing.module.css';
import { useReveal } from './useReveal';

/**
 * Text-forward statement section (documents/TASK-home-page-content.md §2):
 * large display type, no 3D — the copy carries it. "Imagine" is solid,
 * "Now imagine" uses the brand gradient.
 */
export function Imagine() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      className={`${styles.section} ${styles.imagine} ${visible ? styles.visible : ''}`}
      aria-label="Imagine"
    >
      <div className={styles.container}>
        <p className={styles.imagineLine}>
          <strong className={styles.imagineLead}>Imagine</strong> giving your customers a 360° view
          of your products — letting them explore every angle and detail.
        </p>
        <p className={styles.imagineLine}>
          <strong className={`${styles.imagineLead} ${styles.gradText}`}>Now imagine</strong> they
          can place your product right in their own home or office, and truly see how it looks and
          fits in their space.
        </p>
      </div>
    </section>
  );
}
