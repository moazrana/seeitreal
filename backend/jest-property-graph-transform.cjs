'use strict';

// Minimal, single-purpose Jest transformer for exactly one file:
// property-graph/dist/index.mjs (a dependency of @gltf-transform/core, used
// by ModelScalingService — documents/TASK-real-world-ar-sizing.md).
//
// @gltf-transform/core's CJS build does `require('property-graph')`, but
// property-graph ships ESM-only (package.json has no "require" export
// condition). Real Node 22 resolves that at runtime via its built-in
// require(esm) interop, so the actual app is unaffected — but Jest
// implements its own CJS module loader and doesn't support that interop,
// so it throws a SyntaxError trying to parse the bare `export { ... }`
// statement as CommonJS.
//
// property-graph's dist file is a single rollup-bundled module whose only
// ESM syntax is one trailing `export { A, B, C };` (no imports at all —
// see the regex guard below), so rather than pull in a full Babel preset
// for one file, this does the one substitution actually needed.
module.exports = {
  process(sourceText, sourcePath) {
    const trailingExport = /export\s*\{([^}]*)\}\s*;?\s*$/;
    if (!trailingExport.test(sourceText.trimEnd())) {
      throw new Error(
        `jest-property-graph-transform: ${sourcePath} no longer matches the ` +
          'expected single-trailing-export shape (property-graph likely ' +
          'published a new build) — update this transformer or reconsider ' +
          'whether it is still needed.',
      );
    }
    const code = sourceText.replace(
      trailingExport,
      (_match, names) => `module.exports = { ${names.trim()} };`,
    );
    return { code };
  },
};
