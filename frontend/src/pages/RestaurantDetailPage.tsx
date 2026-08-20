import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { menuApi } from '../api/menu';
import { restaurantsApi } from '../api/restaurants';
import type { MenuCategory, MenuItem, Restaurant } from '../api/types';
import { AppShell } from '../components/AppShell';
import { ErrorBanner } from '../components/ErrorBanner';
import { QrCodeModal } from '../components/QrCodeModal';
import { errorMessage } from '../lib/errors';
import { itemArViewerUrl } from '../lib/publicUrls';
import { StatusBadge } from '../components/StatusBadge';

function formatPrice(price: string): string {
  const n = Number(price);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : price;
}

export function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const restaurantId = Number(id);

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [qrItem, setQrItem] = useState<MenuItem | null>(null);

  const [categoryName, setCategoryName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState('');

  function loadAll() {
    Promise.all([
      restaurantsApi.get(restaurantId),
      menuApi.listCategories(restaurantId),
      menuApi.listItems(restaurantId),
    ])
      .then(([r, c, i]) => {
        setRestaurant(r);
        setCategories(c);
        setItems(i);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(loadAll, [restaurantId]);

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await menuApi.createCategory(restaurantId, { name: categoryName });
      setCategoryName('');
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteCategory(categoryId: number) {
    setError(null);
    try {
      await menuApi.deleteCategory(restaurantId, categoryId);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await menuApi.createItem(restaurantId, {
        name: itemName,
        price: Number(itemPrice),
        categoryId: itemCategoryId ? Number(itemCategoryId) : undefined,
      });
      setItemName('');
      setItemPrice('');
      setItemCategoryId('');
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteItem(itemId: number) {
    setError(null);
    try {
      await menuApi.deleteItem(restaurantId, itemId);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handlePhotoChange(itemId: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    setError(null);
    setBusyItemId(itemId);
    try {
      await menuApi.uploadPhoto(restaurantId, itemId, file);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleGenerateModel(itemId: number) {
    setError(null);
    setBusyItemId(itemId);
    try {
      await menuApi.generateModel(restaurantId, itemId);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <AppShell>
      {qrItem && (
        <QrCodeModal
          title={qrItem.name}
          url={itemArViewerUrl(qrItem.publicSlug)}
          onClose={() => setQrItem(null)}
        />
      )}
      <h1>{restaurant?.name ?? 'Restaurant'}</h1>
      <ErrorBanner message={error} />

      <section>
        <h2>Categories</h2>
        <ul className="chip-list">
          {categories.map((c) => (
            <li key={c.id} className="chip">
              {c.name}
              <button type="button" className="chip-remove" onClick={() => void handleDeleteCategory(c.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <form className="inline-form-row" onSubmit={handleAddCategory}>
          <input
            placeholder="New category name"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            required
          />
          <button type="submit">Add category</button>
        </form>
      </section>

      <section>
        <h2>Menu items</h2>
        {items.length === 0 ? (
          <p className="empty-state">No items yet — add your first dish below.</p>
        ) : (
          <ul className="item-list">
            {items.map((item) => (
              <li key={item.id} className="item-card">
                <div className="item-card-photo">
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt={item.name} />
                  ) : (
                    <div className="item-card-photo-placeholder">No photo</div>
                  )}
                </div>
                <div className="item-card-body">
                  <div className="item-card-title-row">
                    <strong>{item.name}</strong>
                    <StatusBadge status={item.arStatus} />
                  </div>
                  <div className="muted">{formatPrice(item.price)}</div>
                  {item.qaNote && <div className="qa-note">{item.qaNote}</div>}
                  <div className="item-card-actions">
                    <label className="link-button">
                      {item.photoUrl ? 'Replace photo' : 'Upload photo'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        hidden
                        disabled={busyItemId === item.id}
                        onChange={(e) => void handlePhotoChange(item.id, e)}
                      />
                    </label>
                    <button
                      type="button"
                      className="link-button"
                      disabled={!item.photoUrl || item.arStatus !== 'pending' || busyItemId === item.id}
                      onClick={() => void handleGenerateModel(item.id)}
                      title={!item.photoUrl ? 'Upload a photo first' : undefined}
                    >
                      Generate 3D model
                    </button>
                    {item.arStatus === 'live' && (
                      <>
                        <a
                          className="link-button"
                          href={itemArViewerUrl(item.publicSlug)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View in AR
                        </a>
                        <button type="button" className="link-button" onClick={() => setQrItem(item)}>
                          Show QR code
                        </button>
                      </>
                    )}
                    <button type="button" className="link-button danger" onClick={() => void handleDeleteItem(item.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className="inline-form" onSubmit={handleAddItem}>
          <h3>Add a dish</h3>
          <label>
            Name
            <input value={itemName} onChange={(e) => setItemName(e.target.value)} required />
          </label>
          <label>
            Price
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={itemPrice}
              onChange={(e) => setItemPrice(e.target.value)}
              required
            />
          </label>
          <label>
            Category
            <select value={itemCategoryId} onChange={(e) => setItemCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Add dish</button>
        </form>
      </section>
    </AppShell>
  );
}
