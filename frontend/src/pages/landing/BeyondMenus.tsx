import styles from './landing.module.css';
import { useReveal } from './useReveal';

const CATEGORIES = [
  { label: 'Restaurants', status: 'live' as const },
  { label: 'Clothing', status: 'soon' as const },
  { label: 'Furniture', status: 'soon' as const },
  { label: 'Retail', status: 'soon' as const },
];

export function BeyondMenus() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section ref={ref} className={`${styles.section} ${visible ? styles.visible : ''}`}>
      <div className={styles.container}>
        <div className={styles.beyondPanel}>
          <h2 className={styles.h2}>Same technology. Any product.</h2>
          <p className={styles.beyondSub}>
            The same photo-to-3D pipeline that puts a dish on the table works for anything a
            customer would rather see than imagine.
          </p>
          <div className={styles.chips}>
            {CATEGORIES.map((category) => (
              <span
                key={category.label}
                className={`${styles.chip} ${category.status === 'live' ? styles.chipLive : styles.chipSoon}`}
              >
                {category.label}
                {category.status === 'soon' ? ' — soon' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
