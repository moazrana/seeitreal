/**
 * Source of `/api/static/ar-viewer-theme.js`, loaded by the diner AR viewer
 * right after its <model-viewer> element (documents/USER-APP-theming.md §5).
 *
 * The page's colours already follow the diner's `prefers-color-scheme` in
 * pure CSS; this only swaps the two things CSS can't reach — the
 * `exposure` and `environment-image` attributes — using the per-theme values
 * the server rendered into `data-*` attributes. It is a classic script that
 * runs before the deferred model-viewer module upgrades the element, so the
 * environment image is fetched once, for the right theme.
 *
 * Served as a same-origin file (not inline) so the viewer's CSP keeps
 * `script-src 'self'` without `'unsafe-inline'`. It reads only attributes
 * the server already escaped and writes them via setAttribute — never
 * through HTML parsing.
 */
export const AR_VIEWER_THEME_SCRIPT = `(function () {
  if (!window.matchMedia) return;
  var query = window.matchMedia('(prefers-color-scheme: light)');
  function apply() {
    var theme = query.matches ? 'light' : 'dark';
    var viewers = document.querySelectorAll('model-viewer[data-theme-aware]');
    for (var i = 0; i < viewers.length; i++) {
      var viewer = viewers[i];
      var environment = viewer.getAttribute('data-environment-image-' + theme);
      var exposure = viewer.getAttribute('data-exposure-' + theme);
      if (environment) viewer.setAttribute('environment-image', environment);
      if (exposure) viewer.setAttribute('exposure', exposure);
    }
  }
  apply();
  if (query.addEventListener) query.addEventListener('change', apply);
})();
`;
