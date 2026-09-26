import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { cuisineTabId } from '../lib/cuisine';
import type { CuisineFilter, CuisineTab } from '../lib/cuisine';
import styles from './CuisineTabs.module.css';

interface CuisineTabsProps {
  tabs: CuisineTab[];
  active: CuisineFilter;
  onChange: (value: CuisineFilter) => void;
  /** id of the tabpanel these tabs control. */
  panelId: string;
}

/**
 * WAI-ARIA tabs (automatic activation): Tab moves into/out of the list,
 * Left/Right/Home/End move between cuisines. Only the active tab is in the
 * tab order (roving tabindex).
 */
export function CuisineTabs({ tabs, active, onChange, panelId }: CuisineTabsProps) {
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = tabs.findIndex((tab) => tab.value === active);
    const last = tabs.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? current === last
          ? 0
          : current + 1
        : e.key === 'ArrowLeft'
          ? current === 0
            ? last
            : current - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].value);
    buttonsRef.current[next]?.focus();
  }

  return (
    <div role="tablist" aria-label="Cuisine types" className={styles.tabs} onKeyDown={handleKeyDown}>
      {tabs.map((tab, index) => {
        const selected = tab.value === active;
        return (
          <button
            key={String(tab.value)}
            ref={(el) => {
              buttonsRef.current[index] = el;
            }}
            type="button"
            role="tab"
            id={cuisineTabId(tab.value)}
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
            <span className={styles.count}>{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
