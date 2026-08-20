import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeModalProps {
  title: string;
  url: string;
  onClose: () => void;
}

/**
 * QR code generated entirely client-side (no third-party "QR API" call) —
 * the dish's public URL never leaves the browser just to render a code
 * for it.
 */
export function QrCodeModal({ title, url, onClose }: QrCodeModalProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setError(null);
    QRCode.toDataURL(url, { width: 256, margin: 2 })
      .then((generated) => {
        if (!cancelled) setDataUrl(generated);
      })
      .catch(() => {
        if (!cancelled) setError('Could not generate the QR code.');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </div>
        {error && <p className="qa-note">{error}</p>}
        {!error && (dataUrl ? <img className="qr-code-image" src={dataUrl} alt={`QR code for ${title}`} /> : <p>Generating…</p>)}
        <p className="muted qr-code-url">{url}</p>
      </div>
    </div>
  );
}
