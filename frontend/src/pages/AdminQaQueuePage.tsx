import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/admin';
import type { QaQueueItem } from '../api/types';
import { AppShell } from '../components/AppShell';
import { ErrorBanner } from '../components/ErrorBanner';
import { errorMessage } from '../lib/errors';

function formatPrice(price: string): string {
  const n = Number(price);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : price;
}

export function AdminQaQueuePage() {
  const [items, setItems] = useState<QaQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [rejectingItemId, setRejectingItemId] = useState<number | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  function load() {
    adminApi
      .qaQueue()
      .then(setItems)
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(load, []);

  async function handleApprove(itemId: number) {
    setError(null);
    setBusyItemId(itemId);
    try {
      await adminApi.approveItem(itemId);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  function openRejectForm(itemId: number) {
    setError(null);
    setRejectNote('');
    setRejectingItemId(itemId);
  }

  async function handleReject(e: FormEvent, itemId: number) {
    e.preventDefault();
    setError(null);
    setBusyItemId(itemId);
    try {
      await adminApi.rejectItem(itemId, rejectNote);
      setRejectingItemId(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <AppShell>
      <h1>Model QA queue</h1>
      <p className="muted">
        Items here finished 3D generation and are waiting for review before diners can see them
        in AR. Approve publishes the item as-is; reject sends it back to the owner with a note and
        clears the generated model, so they can re-upload a photo and try again.
      </p>
      <ErrorBanner message={error} />

      {items === null ? (
        <p>Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty-state">Nothing waiting for review right now.</p>
      ) : (
        <ul className="item-list">
          {items.map((item) => (
            <li key={item.id} className="item-card">
              <div className="item-card-photo">
                {item.previewImageUrl ? (
                  <img src={item.previewImageUrl} alt={`Generated 3D preview of ${item.name}`} />
                ) : item.photoUrl ? (
                  <img src={item.photoUrl} alt={item.name} />
                ) : (
                  <div className="item-card-photo-placeholder">No preview</div>
                )}
              </div>
              <div className="item-card-body">
                <div className="item-card-title-row">
                  <strong>{item.name}</strong>
                </div>
                <div className="muted">
                  <Link to={`/restaurants/${item.restaurant.id}`}>{item.restaurant.name}</Link>
                  {' · '}
                  {formatPrice(item.price)}
                </div>
                <div className="qa-model-links">
                  {item.photoUrl && (
                    <a href={item.photoUrl} target="_blank" rel="noreferrer">
                      Original photo
                    </a>
                  )}
                  {item.modelGlbUrl && (
                    <a href={item.modelGlbUrl} target="_blank" rel="noreferrer">
                      GLB
                    </a>
                  )}
                  {item.modelUsdzUrl && (
                    <a href={item.modelUsdzUrl} target="_blank" rel="noreferrer">
                      USDZ
                    </a>
                  )}
                </div>
                {item.qaNote && <div className="qa-note">{item.qaNote}</div>}

                {rejectingItemId === item.id ? (
                  <form className="qa-reject-form" onSubmit={(e) => void handleReject(e, item.id)}>
                    <label>
                      Note to the owner
                      <textarea
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        required
                        minLength={1}
                        maxLength={1000}
                        rows={3}
                      />
                    </label>
                    <div className="item-card-actions">
                      <button type="submit" disabled={busyItemId === item.id}>
                        {busyItemId === item.id ? 'Rejecting…' : 'Confirm reject'}
                      </button>
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => setRejectingItemId(null)}
                        disabled={busyItemId === item.id}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="item-card-actions">
                    <button
                      type="button"
                      disabled={busyItemId === item.id}
                      onClick={() => void handleApprove(item.id)}
                    >
                      {busyItemId === item.id ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      className="link-button danger"
                      disabled={busyItemId === item.id}
                      onClick={() => openRejectForm(item.id)}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
