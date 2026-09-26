import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ConfirmOptions } from '../components/ConfirmDialog';

/**
 * Promise-based confirmation: `if (!(await confirm({...}))) return;`.
 * Render the returned `confirmDialog` once in the component tree.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second request while one is open cancels the first.
    resolveRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleResolve = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  const confirmDialog = options ? <ConfirmDialog {...options} onResolve={handleResolve} /> : null;

  return { confirm, confirmDialog };
}
