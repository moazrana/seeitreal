import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/** JSX typing for Google's <model-viewer> custom element (the attributes
 * the showcase uses). The element itself is loaded at runtime from the
 * API's self-hosted bundle — see useModelViewerScript. */
type ModelViewerAttributes = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  src: string;
  'ios-src'?: string;
  alt: string;
  ar?: boolean;
  'ar-modes'?: string;
  'ar-scale'?: string;
  'camera-controls'?: boolean;
  'auto-rotate'?: boolean;
  'rotation-per-second'?: string;
  'interaction-prompt'?: string;
  'touch-action'?: string;
  'shadow-intensity'?: string;
  'environment-image'?: string;
  exposure?: string;
  loading?: 'auto' | 'lazy' | 'eager';
};

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': ModelViewerAttributes;
    }
  }
}
