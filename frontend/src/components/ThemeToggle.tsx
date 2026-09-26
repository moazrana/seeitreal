import { THEME_PREFERENCES } from '@ar-menu/shared';
import type { ThemePreference } from '@ar-menu/shared';
import { useTheme } from '../context/useTheme';
import styles from './ThemeToggle.module.css';

const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

function Icon({ preference }: { preference: ThemePreference }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    'aria-hidden': true,
  };
  if (preference === 'light') {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
      </svg>
    );
  }
  if (preference === 'dark') {
    return (
      <svg {...common}>
        <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="3" width="12" height="8" rx="1.2" />
      <path d="M6 13.5h4M8 11v2.5" />
    </svg>
  );
}

/**
 * System / Light / Dark switch (documents/USER-APP-theming.md §4, §6).
 * Built on native radio inputs so keyboard support (Tab into the group,
 * arrow keys between options) and screen-reader semantics come for free;
 * the labels stay in the DOM as visually-hidden text.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();

  return (
    <fieldset className={`${styles.toggle} ${className ?? ''}`}>
      <legend className={styles.visuallyHidden}>Colour theme</legend>
      {THEME_PREFERENCES.map((option) => (
        <label key={option} className={styles.option} title={LABELS[option]}>
          <input
            type="radio"
            name="seeitreal-theme"
            value={option}
            checked={preference === option}
            onChange={() => setPreference(option)}
            className={styles.input}
          />
          <span className={styles.face}>
            <Icon preference={option} />
            <span className={styles.visuallyHidden}>{LABELS[option]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
