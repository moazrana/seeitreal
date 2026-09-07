import { useEffect } from 'react';
import { BeyondMenus } from './BeyondMenus';
import { CtaBand } from './CtaBand';
import { Features } from './Features';
import { Footer } from './Footer';
import { Hero } from './Hero';
import { HowItWorks } from './HowItWorks';
import styles from './landing.module.css';
import { Nav } from './Nav';

/**
 * Public marketing site (spec: seeitreal-design-spec.md). Standalone from
 * the authenticated dashboard — it renders its own dark theme scoped under
 * `.root` (landing.module.css) instead of the dashboard's global,
 * light-theme index.css, so the two never collide.
 */
export function LandingPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'SeeItReal — Augmented reality for menus';
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className={styles.root}>
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <BeyondMenus />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}
