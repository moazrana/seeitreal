import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { menuApi } from '../api/menu';
import { restaurantsApi } from '../api/restaurants';
import type { MenuCategory, MenuItem, Restaurant } from '../api/types';
import { AppShell } from '../components/AppShell';
import { ErrorBanner } from '../components/ErrorBanner';
import { PhotoCaptureGuide } from '../components/PhotoCaptureGuide';
import { QrCodeModal } from '../components/QrCodeModal';
import { errorMessage } from '../lib/errors';
import { itemArViewerUrl } from '../lib/publicUrls';
import { StatusBadge } from '../components/StatusBadge';

// Up to 5 input photos per dish (documents/3d-model-enhancement.md §1) —
// mirrors the server-side MAX_ITEM_PHOTOS. Client-side check here is UX
// only; the server is the authoritative limit.
const MAX_ITEM_PHOTOS = 5;

// Real-world dish size (documents/TASK-real-world-ar-sizing.md) — stored
// as mm, shown as cm since that's the more natural unit for a dish's size.
function formatDimensions(item: MenuItem): string | null {
  const parts = [item.widthMm, item.heightMm, item.lengthMm];
  if (parts.every((v) => v === null)) return null;
  return parts.map((v) => (v === null ? '?' : `${(v / 10).toFixed(1)}`)).join(' × ') + ' cm (W×H×L)';
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
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemWidthMm, setItemWidthMm] = useState('');
  const [itemHeightMm, setItemHeightMm] = useState('');
  const [itemLengthMm, setItemLengthMm] = useState('');

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
        categoryId: itemCategoryId ? Number(itemCategoryId) : undefined,
        widthMm: itemWidthMm ? Number(itemWidthMm) : undefined,
        heightMm: itemHeightMm ? Number(itemHeightMm) : undefined,
        lengthMm: itemLengthMm ? Number(itemLengthMm) : undefined,
      });
      setItemName('');
      setItemCategoryId('');
      setItemWidthMm('');
      setItemHeightMm('');
      setItemLengthMm('');
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

  async function handlePhotosChange(itemId: number, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file(s) later
    if (files.length === 0) return;
    setError(null);
    setBusyItemId(itemId);
    try {
      await menuApi.uploadPhotos(restaurantId, itemId, files);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleRemovePhoto(itemId: number, photoId: number) {
    setError(null);
    setBusyItemId(itemId);
    try {
      await menuApi.deletePhoto(restaurantId, itemId, photoId);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleModelChange(itemId: number, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusyItemId(itemId);
    try {
      await menuApi.uploadModel(restaurantId, itemId, file);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleSaveDimensions(itemId: number, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const width = form.get('widthMm') as string;
    const height = form.get('heightMm') as string;
    const length = form.get('lengthMm') as string;
    setBusyItemId(itemId);
    try {
      await menuApi.updateItem(restaurantId, itemId, {
        widthMm: width ? Number(width) : undefined,
        heightMm: height ? Number(height) : undefined,
        lengthMm: length ? Number(length) : undefined,
      });
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
        <PhotoCaptureGuide />
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
                  <div className="muted">{formatDimensions(item) ?? 'No dimensions set yet'}</div>
                  <form
                    className="dimensions-form"
                    onSubmit={(e) => void handleSaveDimensions(item.id, e)}
                  >
                    <input
                      name="widthMm"
                      type="number"
                      min={1}
                      max={5000}
                      placeholder="Width (mm)"
                      defaultValue={item.widthMm ?? ''}
                      disabled={busyItemId === item.id}
                    />
                    <input
                      name="heightMm"
                      type="number"
                      min={1}
                      max={5000}
                      placeholder="Height (mm)"
                      defaultValue={item.heightMm ?? ''}
                      disabled={busyItemId === item.id}
                    />
                    <input
                      name="lengthMm"
                      type="number"
                      min={1}
                      max={5000}
                      placeholder="Length (mm)"
                      defaultValue={item.lengthMm ?? ''}
                      disabled={busyItemId === item.id}
                    />
                    <button type="submit" className="link-button" disabled={busyItemId === item.id}>
                      Save size
                    </button>
                  </form>
                  {item.qaNote && <div className="qa-note">{item.qaNote}</div>}
                  {item.photos.length > 0 && (
                    <ul className="photo-thumb-strip">
                      {item.photos.map((photo) => (
                        <li key={photo.id} className="photo-thumb">
                          <img src={photo.url} alt="" />
                          <button
                            type="button"
                            className="photo-thumb-remove"
                            disabled={busyItemId === item.id}
                            title="Remove this photo"
                            onClick={() => void handleRemovePhoto(item.id, photo.id)}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="item-card-actions">
                    <label
                      className="link-button"
                      title={
                        item.photos.length >= MAX_ITEM_PHOTOS
                          ? `A dish can have at most ${MAX_ITEM_PHOTOS} photos`
                          : undefined
                      }
                    >
                      {item.photos.length > 0 ? 'Add more photos' : 'Upload photos'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        multiple
                        hidden
                        disabled={busyItemId === item.id || item.photos.length >= MAX_ITEM_PHOTOS}
                        onChange={(e) => void handlePhotosChange(item.id, e)}
                      />
                    </label>
                    <button
                      type="button"
                      className="link-button"
                      disabled={
                        !item.photoUrl || !item.widthMm || item.arStatus !== 'pending' || busyItemId === item.id
                      }
                      onClick={() => void handleGenerateModel(item.id)}
                      title={
                        !item.photoUrl
                          ? 'Upload a photo first'
                          : !item.widthMm
                            ? 'Enter the dish width first'
                            : item.photos.length >= 2
                              ? `Generates from all ${Math.min(item.photos.length, 4)} photos (multiview)`
                              : undefined
                      }
                    >
                      Generate 3D model
                    </button>
                    <label
                      className="link-button"
                      title={
                        !item.widthMm
                          ? 'Enter the dish width first'
                          : 'Upload a finished .glb instead of generating one (hero dishes)'
                      }
                    >
                      Upload finished GLB
                      <input
                        type="file"
                        accept=".glb,model/gltf-binary"
                        hidden
                        disabled={!item.widthMm || item.arStatus !== 'pending' || busyItemId === item.id}
                        onChange={(e) => void handleModelChange(item.id, e)}
                      />
                    </label>
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
          <label>
            Width (mm)
            <input
              type="number"
              min="1"
              max="5000"
              value={itemWidthMm}
              onChange={(e) => setItemWidthMm(e.target.value)}
              placeholder="e.g. 260 for a 26cm plate"
            />
          </label>
          <label>
            Height (mm)
            <input
              type="number"
              min="1"
              max="5000"
              value={itemHeightMm}
              onChange={(e) => setItemHeightMm(e.target.value)}
            />
          </label>
          <label>
            Length (mm)
            <input
              type="number"
              min="1"
              max="5000"
              value={itemLengthMm}
              onChange={(e) => setItemLengthMm(e.target.value)}
            />
          </label>
          <p className="muted">
            Dimensions can be added later, but width is required before generating a 3D model —
            it's used to scale the model to true size in AR.
          </p>
          <button type="submit">Add dish</button>
        </form>
      </section>
    </AppShell>
  );
}
