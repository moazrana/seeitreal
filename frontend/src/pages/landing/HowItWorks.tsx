import styles from './landing.module.css';
import { useReveal } from './useReveal';

const STEPS = [
  {
    title: 'Snap a few photos',
    body: 'Up to five angles of the dish, from a phone. No studio, no special gear.',
  },
  {
    title: 'We build the 3D',
    body: 'A real-size model is generated and checked by a person before it goes live.',
  },
  {
    title: 'Print the code',
    body: 'Every dish gets its own QR code, ready for the table, the menu, or a table tent.',
  },
  {
    title: 'Diners see it real',
    body: 'They scan, and the dish appears on their own table — actual size, in AR.',
  },
];

export function HowItWorks() {
  const { ref, visible } = useReveal<HTMLElement>();

  return (
    <section
      id="how"
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.container}>
        <h2 className={styles.h2}>How it works</h2>
        <p className={styles.sectionIntro}>
          Four steps from dish to diner. No app, no special hardware, no guesswork.
        </p>

        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className={`${styles.step} ${index === 0 ? styles.stepFirst : ''}`}
            >
              <div className={styles.stepNumber}>{String(index + 1).padStart(2, '0')}</div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
