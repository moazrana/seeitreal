import styles from './landing.module.css';
import { useModelViewerScript } from './useModelViewerScript';
import { useReveal } from './useReveal';

// Demo dishes (CC0, Kenney Food Kit — see public/showcase/LICENSE.txt),
// scaled to real-world size so "View in your space" shows them life-size.
// In production each restaurant shows its own Tripo-generated models.
const DISHES = [
  { slug: 'burger', name: 'Double cheeseburger', size: '12 cm across' },
  { slug: 'pizza', name: 'Margherita pizza', size: '30 cm across' },
  { slug: 'cake', name: 'Birthday cake', size: '22 cm across' },
  { slug: 'skewer', name: 'Grilled skewer', size: '25 cm long' },
] as const;

/**
 * Food showcase (documents/TASK-home-page-content.md §1, §3): several
 * rotating, draggable dishes, each with a "View in your space" AR button
 * (GLB for Android/WebXR, USDZ for iOS Quick Look).
 */
export function Showcase() {
  const { ref, visible } = useReveal<HTMLElement>();
  useModelViewerScript(visible);

  return (
    <section
      id="showcase"
      ref={ref}
      className={`${styles.section} ${visible ? styles.visible : ''}`}
    >
      <div className={styles.container}>
        <h2 className={styles.h2}>Showcase your dishes in an innovative way.</h2>
        <p className={styles.sectionIntro}>
          Every dish becomes a real-size 3D model diners can spin, explore from every angle, and
          drop right onto their own table.
        </p>

        <ul className={styles.showcaseGrid}>
          {DISHES.map((dish) => (
            <li key={dish.slug} className={styles.showcaseCard}>
              <model-viewer
                className={styles.showcaseViewer}
                src={`/showcase/${dish.slug}.glb`}
                ios-src={`/showcase/${dish.slug}.usdz`}
                alt={`3D model of a ${dish.name.toLowerCase()} — drag to rotate`}
                ar
                ar-modes="webxr scene-viewer quick-look"
                ar-scale="fixed"
                camera-controls
                auto-rotate
                rotation-per-second="20deg"
                interaction-prompt="none"
                touch-action="pan-y"
                shadow-intensity="1"
                environment-image="neutral"
                loading="lazy"
              >
                <button slot="ar-button" className={styles.showcaseArButton}>
                  View in your space
                </button>
              </model-viewer>
              <div className={styles.showcaseMeta}>
                <h3 className={styles.showcaseName}>{dish.name}</h3>
                <span className={styles.showcaseSize}>{dish.size}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className={styles.showcaseHint}>
          Drag to rotate. On a phone, tap “View in your space” to place it on your table.
        </p>
      </div>
    </section>
  );
}
