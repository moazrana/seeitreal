import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { billingApi } from '../api/billing';
import { menuApi } from '../api/menu';
import { restaurantsApi } from '../api/restaurants';
import type { MenuCategory, MenuItem, Restaurant, Subscription } from '../api/types';
import { AppShell } from '../components/AppShell';
import { ErrorBanner } from '../components/ErrorBanner';
import { PhotoCaptureGuide } from '../components/PhotoCaptureGuide';
import { QrCodeModal } from '../components/QrCodeModal';
import { errorMessage } from '../lib/errors';
import { itemArViewerUrl } from '../lib/publicUrls';
import { StatusBadge } from '../components/StatusBadge';
import s from './RestaurantDetailPage.module.css';

// Up to 5 input photos per dish (documents/3d-model-enhancement.md §1) —
// mirrors the server-side MAX_ITEM_PHOTOS. Client-side check here is UX
// only; the server is the authoritative limit.
const MAX_ITEM_PHOTOS = 5;

// Real-world dish size (documents/TASK-real-world-ar-sizing.md) — stored
// as mm, shown as cm since that's the more natural unit for a dish's size.
function formatDimensions(item: MenuItem): string | null {
  const parts = [item.widthMm, item.heightMm, item.lengthMm];
  if (parts.every((v) => v === null)) return null;
  return (
    parts.map((v) => (v === null ? '?' : `${(v / 10).toFixed(1)}`)).join(' × ') + ' cm (W×H×L)'
  );
}

export function RestaurantDetailPage() {
  const { slug: restaurantSlug = '' } = useParams<{ slug: string }>();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
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
      restaurantsApi.get(restaurantSlug),
      menuApi.listCategories(restaurantSlug),
      menuApi.listItems(restaurantSlug),
      billingApi.getSubscription(restaurantSlug),
    ])
      .then(([r, c, i, sub]) => {
        setRestaurant(r);
        setCategories(c);
        setItems(i);
        setSubscription(sub);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(loadAll, [restaurantSlug]);

  async function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await menuApi.createCategory(restaurantSlug, { name: categoryName });
      setCategoryName('');
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteCategory(categoryId: number) {
    setError(null);
    try {
      await menuApi.deleteCategory(restaurantSlug, categoryId);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleAddItem(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await menuApi.createItem(restaurantSlug, {
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

  async function handleDeleteItem(item: MenuItem) {
    setError(null);
    try {
      await menuApi.deleteItem(restaurantSlug, item.publicSlug);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handlePhotosChange(item: MenuItem, e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-selecting the same file(s) later
    if (files.length === 0) return;
    setError(null);
    setBusyItemId(item.id);
    try {
      await menuApi.uploadPhotos(restaurantSlug, item.publicSlug, files);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleRemovePhoto(item: MenuItem, photoId: number) {
    setError(null);
    setBusyItemId(item.id);
    try {
      await menuApi.deletePhoto(restaurantSlug, item.publicSlug, photoId);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleModelChange(item: MenuItem, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setBusyItemId(item.id);
    try {
      await menuApi.uploadModel(restaurantSlug, item.publicSlug, file);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleSaveDimensions(item: MenuItem, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const width = form.get('widthMm') as string;
    const height = form.get('heightMm') as string;
    const length = form.get('lengthMm') as string;
    setBusyItemId(item.id);
    try {
      await menuApi.updateItem(restaurantSlug, item.publicSlug, {
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

  async function handleGenerateModel(item: MenuItem) {
    setError(null);
    setBusyItemId(item.id);
    try {
      await menuApi.generateModel(restaurantSlug, item.publicSlug);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  const liveCount = items.filter((item) => item.arStatus === 'live').length;

  return (
    <AppShell>
      {qrItem && (
        <QrCodeModal
          title={qrItem.name}
          url={itemArViewerUrl(qrItem.publicSlug)}
          onClose={() => setQrItem(null)}
        />
      )}
      <ErrorBanner message={error} />

      <div className={s.hero}>
        <div className={s.heroGlow} aria-hidden="true" />
        <div className={s.heroLinks}>
          <Link to={`/restaurants/${restaurantSlug}/billing`} className={s.backLink}>
            Billing →
          </Link>
        </div>
        {subscription?.status === 'past_due' && subscription.graceUntil && (
          <div className={`status-banner banner-warning ${s.bannerSpacing}`}>
            <strong>Payment failed.</strong>{' '}
            <Link to={`/restaurants/${restaurantSlug}/billing`}>Update your payment method</Link> to
            keep your dish links online.
          </div>
        )}
        {subscription?.status === 'expired' && (
          <div className={`status-banner banner-expired ${s.bannerSpacing}`}>
            <strong>Your menus are offline.</strong>{' '}
            <Link to={`/restaurants/${restaurantSlug}/billing`}>Reactivate now</Link> to bring your
            dish links back — nothing was deleted.
          </div>
        )}
        <div className={s.heroTop}>
          <div>
            <span className={s.eyebrow}>
              <span className={s.eyebrowDot} aria-hidden="true" />
              Restaurant
            </span>
            <h1 className={s.heroTitle}>{restaurant?.name ?? 'Loading…'}</h1>
            {restaurant && <p className={s.heroSlug}>/{restaurant.slug}</p>}
          </div>
          <div className={s.statRow}>
            <div className={s.statCard}>
              <span className={s.statValue}>{items.length}</span>
              <span className={s.statLabel}>Dishes</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statValue}>{liveCount}</span>
              <span className={s.statLabel}>Live in AR</span>
            </div>
            <div className={s.statCard}>
              <span className={s.statValue}>{categories.length}</span>
              <span className={s.statLabel}>Categories</span>
            </div>
          </div>
        </div>
      </div>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2>Categories</h2>
        </div>
        <div className={s.categoryRow}>
          {categories.map((c) => (
            <span key={c.id} className={s.categoryChip}>
              {c.name}
              <button
                type="button"
                className={s.categoryChipRemove}
                onClick={() => void handleDeleteCategory(c.id)}
                aria-label={`Delete category ${c.name}`}
              >
                ×
              </button>
            </span>
          ))}
          <form className={s.categoryAddForm} onSubmit={handleAddCategory}>
            <input
              placeholder="New category…"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              required
            />
            <button type="submit">+ Add</button>
          </form>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2>Menu items</h2>
          <span className={s.sectionCount}>
            {items.length} dish{items.length === 1 ? '' : 'es'}
          </span>
        </div>
        <PhotoCaptureGuide />
        {items.length === 0 ? (
          <div className={s.emptyCard}>
            <strong>No dishes yet</strong>
            Add your first dish below to start generating AR models.
          </div>
        ) : (
          <ul className={s.grid}>
            {items.map((item) => (
              <li key={item.id} className={s.dishCard} data-status={item.arStatus}>
                <div className={s.dishPhotoWrap}>
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt={item.name} />
                  ) : (
                    <div className={s.dishPhotoPlaceholder}>No photo</div>
                  )}
                  <span className={s.dishStatusPin}>
                    <StatusBadge status={item.arStatus} />
                  </span>
                </div>
                <div className={s.dishBody}>
                  <h3 className={s.dishName}>{item.name}</h3>
                  <p className={s.dishDims}>{formatDimensions(item) ?? 'No dimensions set yet'}</p>
                  <form
                    className={s.dishDimForm}
                    onSubmit={(e) => void handleSaveDimensions(item, e)}
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
                            onClick={() => void handleRemovePhoto(item, photo.id)}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className={s.dishActions}>
                    <label
                      className={s.actionBtn}
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
                        onChange={(e) => void handlePhotosChange(item, e)}
                      />
                    </label>
                    <button
                      type="button"
                      className={`${s.actionBtn} ${s.actionBtnPrimary}`}
                      disabled={
                        !item.photoUrl ||
                        !item.widthMm ||
                        item.arStatus !== 'pending' ||
                        busyItemId === item.id
                      }
                      onClick={() => void handleGenerateModel(item)}
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
                      className={s.actionBtn}
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
                        disabled={
                          !item.widthMm || item.arStatus !== 'pending' || busyItemId === item.id
                        }
                        onChange={(e) => void handleModelChange(item, e)}
                      />
                    </label>
                    {item.arStatus === 'live' && (
                      <>
                        <a
                          className={s.actionBtn}
                          href={itemArViewerUrl(item.publicSlug)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View in AR
                        </a>
                        <button
                          type="button"
                          className={s.actionBtn}
                          onClick={() => setQrItem(item)}
                        >
                          Show QR code
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className={`${s.actionBtn} ${s.actionBtnDanger}`}
                      onClick={() => void handleDeleteItem(item)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form className={s.addDishCard} onSubmit={handleAddItem}>
          <h3 className={s.addDishHead}>
            <span className={s.addDishHeadIcon} aria-hidden="true">
              +
            </span>
            Add a dish
          </h3>
          <div className={s.addDishGrid}>
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
          </div>
          <p className={s.addDishNote}>
            Dimensions can be added later, but width is required before generating a 3D model — it's
            used to scale the model to true size in AR.
          </p>
          <button type="submit" className={s.addDishSubmit}>
            Add dish
          </button>
        </form>
      </section>
    </AppShell>
  );
}
