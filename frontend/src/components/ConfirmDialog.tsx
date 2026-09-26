import { useEffect, useRef } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  /** Styles the confirm button as destructive (default true — every current
   * caller is a delete). */
  destructive?: boolean;
}

interface ConfirmDialogProps extends ConfirmOptions {
  onResolve: (confirmed: boolean) => void;
}

/**
 * Modal confirmation built on the native <dialog> element: showModal()
 * gives a real focus trap, inert background, Escape-to-cancel and correct
 * screen-reader semantics without re-implementing any of them. Focus
 * starts on Cancel so a stray Enter never confirms a delete.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  destructive = true,
  onResolve,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      // Escape fires `cancel`; treat it exactly like the Cancel button.
      onCancel={(e) => {
        e.preventDefault();
        onResolve(false);
      }}
      // A click whose target is the <dialog> itself landed on the backdrop.
      onClick={(e) => {
        if (e.target === e.currentTarget) onResolve(false);
      }}
    >
      <h3 id="confirm-dialog-title" className={styles.title}>
        {title}
      </h3>
      <p id="confirm-dialog-message" className={styles.message}>
        {message}
      </p>
      <div className={styles.actions}>
        <button
          ref={cancelRef}
          type="button"
          className={styles.cancel}
          onClick={() => onResolve(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className={destructive ? styles.danger : undefined}
          onClick={() => onResolve(true)}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
