import { useEffect, useState } from 'react';

/** True once the page has scrolled past `threshold` px — drives the nav's
 * transparent-to-solid transition (spec §4.1). */
export function useScrolled(threshold = 20) {
  const [scrolled, setScrolled] = useState(() => window.scrollY > threshold);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return scrolled;
}
