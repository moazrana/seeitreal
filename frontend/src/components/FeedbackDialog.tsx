import { useEffect, useRef } from 'react';
import styles from './FeedbackDialog.module.css';

export type FeedbackTone = 'success' | 'warning';

export interface FeedbackOptions {
  tone: FeedbackTone;
  title: string;
  message: string;
}

interface FeedbackDialogProps extends FeedbackOptions {
  onClose: () => void;
}

/**
 * Small celebratory / cautionary modal ("Dish added", "Already on your
 * menu"). The animation is pure CSS — an SVG stroke draw plus a spring pop
 * (success) or a short shake (warning) — so it costs no JS or library
 * weight, and it's switched off under prefers-reduced-motion. Built on the
 * native <dialog> for focus trapping, Escape and screen-reader semantics;
 * the tone is announced via role="alertdialog" for warnings.
 */
export function FeedbackDialog({ tone, title, message, onClose }: FeedbackDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    okRef.current?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      data-tone={tone}
      role={tone === 'warning' ? 'alertdialog' : 'dialog'}
      aria-labelledby="feedback-dialog-title"
      aria-describedby="feedback-dialog-message"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.badge} aria-hidden="true">
        <svg viewBox="0 0 52 52" className={styles.icon}>
          <circle className={styles.ring} cx="26" cy="26" r="24" />
          {tone === 'success' ? (
            <path className={styles.mark} d="M15 27l7 7 15-16" />
          ) : (
            <>
              <path className={styles.mark} d="M26 14v16" />
              <path className={styles.mark} d="M26 37v1" />
            </>
          )}
        </svg>
      </div>
      <h3 id="feedback-dialog-title" className={styles.title}>
        {title}
      </h3>
      <p id="feedback-dialog-message" className={styles.message}>
        {message}
      </p>
      <button ref={okRef} type="button" className={styles.ok} onClick={onClose}>
        {tone === 'success' ? 'Great' : 'Got it'}
      </button>
    </dialog>
  );
}
