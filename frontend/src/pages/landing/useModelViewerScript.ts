import { useEffect } from 'react';
import { API_BASE_URL } from '../../api/client';

// The same pinned, self-hosted bundle the diner AR viewer uses
// (ArViewerController serves it from node_modules). Reusing it avoids a
// second copy of three.js in the app bundle and a version clash with the
// hero's three.js, and needs no third-party CDN.
const MODEL_VIEWER_SRC = `${API_BASE_URL}/vendor/model-viewer.min.js`;

/**
 * Loads the <model-viewer> custom element once, the first time `enabled`
 * is true (typically when the showcase scrolls into view), so its ~1 MB
 * never slows the landing page's first paint. Idempotent across mounts.
 */
export function useModelViewerScript(enabled: boolean) {
  useEffect(() => {
    if (!enabled || customElements.get('model-viewer')) return;
    if (document.querySelector(`script[data-model-viewer]`)) return;
    const script = document.createElement('script');
    script.type = 'module';
    script.src = MODEL_VIEWER_SRC;
    script.dataset.modelViewer = '';
    document.head.appendChild(script);
  }, [enabled]);
}
