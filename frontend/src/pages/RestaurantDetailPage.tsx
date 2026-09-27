import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { billingApi } from '../api/billing';
import { menuApi } from '../api/menu';
import { restaurantsApi } from '../api/restaurants';
import type { MenuCategory, MenuItem, Restaurant, Subscription } from '../api/types';
import { AppShell } from '../components/AppShell';
import { CuisineTabs } from '../components/CuisineTabs';
import { ErrorBanner } from '../components/ErrorBanner';
import { PhotoCaptureGuide } from '../components/PhotoCaptureGuide';
import { QrCodeModal } from '../components/QrCodeModal';
import { useConfirm } from '../hooks/useConfirm';
import { useLiveRefresh } from '../hooks/useLiveRefresh';
import {
  cmInputToMm,
  formatDimensions,
  MAX_DIMENSION_CM,
  MIN_DIMENSION_CM,
  mmToCmInput,
} from '../lib/dimensions';
import { compressDishPhotos } from '../lib/compressImage';
import { cuisineTabId, matchesCuisine } from '../lib/cuisine';
import type { CuisineFilter, CuisineTab } from '../lib/cuisine';
import { errorMessage } from '../lib/errors';
import { itemArViewerUrl } from '../lib/publicUrls';
import { StatusBadge } from '../components/StatusBadge';
import s from './RestaurantDetailPage.module.css';

// Up to 5 input photos per dish (documents/3d-model-enhancement.md §1) —
// mirrors the server-side MAX_ITEM_PHOTOS. Client-side check here is UX
// only; the server is the authoritative limit.
const MAX_ITEM_PHOTOS = 5;

// Live refresh cadence: quick while a model is being produced or awaiting
// QA (the owner is watching for it to land), relaxed otherwise. Two
// requests per tick keeps even the fast rate well inside the API's
// per-user throttle.
const FAST_REFRESH_MS = 5_000;
const IDLE_REFRESH_MS = 20_000;

const ITEMS_PANEL_ID = 'cuisine-items-panel';

function isInProgress(item: MenuItem): boolean {
  return item.arStatus === 'generating' || item.arStatus === 'qa';
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
  const [cuisineFilter, setCuisineFilter] = useState<CuisineFilter>('all');
  const { confirm, confirmDialog } = useConfirm();
  // Monotonic id per data load, so a slow response can never overwrite
  // newer state (e.g. a background refresh landing after a delete).
  const loadSeq = useRef(0);

  const [categoryName, setCategoryName] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemWidthCm, setItemWidthCm] = useState('');
  const [itemHeightCm, setItemHeightCm] = useState('');
  const [itemLengthCm, setItemLengthCm] = useState('');

  function loadAll() {
    const seq = ++loadSeq.current;
    Promise.all([
      restaurantsApi.get(restaurantSlug),
      menuApi.listCategories(restaurantSlug),
      menuApi.listItems(restaurantSlug),
      billingApi.getSubscription(restaurantSlug),
    ])
      .then(([r, c, i, sub]) => {
        if (seq !== loadSeq.current) return;
        setRestaurant(r);
        setCategories(c);
        setItems(i);
        setSubscription(sub);
      })
      .catch((err: unknown) => setError(errorMessage(err)));
  }

  useEffect(loadAll, [restaurantSlug]);

  // Background refresh: dish statuses (model generated → QA → live) and
  // subscription state update on screen without a reload. Errors are left
  // to the next tick rather than flashing the error banner.
  const refreshLive = useCallback(async () => {
    const seq = ++loadSeq.current;
    const [i, sub] = await Promise.all([
      menuApi.listItems(restaurantSlug),
      billingApi.getSubscription(restaurantSlug),
    ]);
    if (seq !== loadSeq.current) return;
    setItems(i);
    setSubscription(sub);
  }, [restaurantSlug]);

  useLiveRefresh(refreshLive, {
    intervalMs: items.some(isInProgress) ? FAST_REFRESH_MS : IDLE_REFRESH_MS,
    enabled: restaurant !== null,
  });

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

  async function handleDeleteCategory(category: MenuCategory) {
    const dishCount = items.filter((item) => item.categoryId === category.id).length;
    const confirmed = await confirm({
      title: `Delete "${category.name}"?`,
      message:
        dishCount > 0
          ? `Its ${dishCount} dish${dishCount === 1 ? '' : 'es'} will be kept and moved to Uncategorized.`
          : 'This cuisine type has no dishes.',
    });
    if (!confirmed) return;
    setError(null);
    try {
      await menuApi.deleteCategory(restaurantSlug, category.id);
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
        widthMm: cmInputToMm(itemWidthCm),
        heightMm: cmInputToMm(itemHeightCm),
        lengthMm: cmInputToMm(itemLengthCm),
      });
      setItemName('');
      setItemCategoryId('');
      setItemWidthCm('');
      setItemHeightCm('');
      setItemLengthCm('');
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function handleDeleteItem(item: MenuItem) {
    const confirmed = await confirm({
      title: `Delete "${item.name}"?`,
      message: item.qrIssuedAt
        ? 'Its photos, 3D model and AR page are removed permanently, and any printed QR code for it will stop working.'
        : 'Its photos and 3D model are removed permanently.',
    });
    if (!confirmed) return;
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
      const optimized = await compressDishPhotos(files);
      await menuApi.uploadPhotos(restaurantSlug, item.publicSlug, optimized);
      loadAll();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleRemovePhoto(item: MenuItem, photoId: number) {
    const confirmed = await confirm({
      title: 'Remove this photo?',
      message: item.modelGlbUrl
        ? "The dish's current 3D model and QR code are not affected."
        : 'You can upload another photo afterwards.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
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
    const field = (name: string) => String(form.get(name) ?? '');
    setBusyItemId(item.id);
    try {
      await menuApi.updateItem(restaurantSlug, item.publicSlug, {
        widthMm: cmInputToMm(field('widthCm')),
        heightMm: cmInputToMm(field('heightCm')),
        lengthMm: cmInputToMm(field('lengthCm')),
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

  // A deleted cuisine type can't stay selected.
  const activeCuisine: CuisineFilter =
    typeof cuisineFilter === 'number' && !categories.some((c) => c.id === cuisineFilter)
      ? 'all'
      : cuisineFilter;
  const uncategorizedCount = items.filter((item) => item.categoryId === null).length;
  const cuisineTabs: CuisineTab[] = [
    { value: 'all', label: 'All', count: items.length },
    ...categories.map((c) => ({
      value: c.id,
      label: c.name,
      count: items.filter((item) => item.categoryId === c.id).length,
    })),
    ...(categories.length > 0 && uncategorizedCount > 0
      ? [{ value: 'none' as const, label: 'Uncategorized', count: uncategorizedCount }]
      : []),
  ];
  const visibleItems = items.filter((item) => matchesCuisine(item, activeCuisine));

  return (
    <AppShell>
      {confirmDialog}
      {qrItem && (
        <QrCodeModal
          title={qrItem.name}
          url={itemArViewerUrl(qrItem.publicSlug)}
          notice={
            qrItem.arStatus === 'live'
              ? undefined
              : "This dish's 3D model is being updated — diners who scan see a “coming soon” note until it's live again."
          }
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
              <span className={s.statLabel}>Cuisine types</span>
            </div>
          </div>
        </div>
      </div>

      <section className={s.section}>
        <div className={s.sectionHead}>
          <h2>Cuisine Types</h2>
        </div>
        <p className={s.sectionHint}>
          Add your dish categories here — e.g. BBQ, Karahi, Desserts, Drinks.
        </p>
        <div className={s.categoryRow}>
          {categories.map((c) => (
            <span key={c.id} className={s.categoryChip}>
              {c.name}
              <button
                type="button"
                className={s.categoryChipRemove}
                onClick={() => void handleDeleteCategory(c)}
                aria-label={`Delete cuisine type ${c.name}`}
              >
                ×
              </button>
            </span>
          ))}
          <form className={s.categoryAddForm} onSubmit={handleAddCategory}>
            <input
              placeholder="New cuisine type…"
              aria-label="New cuisine type"
              maxLength={100}
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
        {items.length > 0 && categories.length > 0 && (
          <CuisineTabs
            tabs={cuisineTabs}
            active={activeCuisine}
            onChange={setCuisineFilter}
            panelId={ITEMS_PANEL_ID}
          />
        )}
        {items.length === 0 ? (
          <div className={s.emptyCard}>
            <strong>No dishes yet</strong>
            Add your first dish below to start generating AR models.
          </div>
        ) : (
          <ul
            className={s.grid}
            id={ITEMS_PANEL_ID}
            {...(categories.length > 0
              ? { role: 'tabpanel', 'aria-labelledby': cuisineTabId(activeCuisine) }
              : {})}
          >
            {visibleItems.length === 0 && (
              <li className={s.emptyCard}>
                <strong>No dishes in this cuisine type yet</strong>
                Pick it as the cuisine type when adding a dish below.
              </li>
            )}
            {visibleItems.map((item) => (
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
                      name="widthCm"
                      type="number"
                      min={MIN_DIMENSION_CM}
                      max={MAX_DIMENSION_CM}
                      step={0.1}
                      placeholder="Width (cm)"
                      aria-label="Width in centimetres"
                      defaultValue={mmToCmInput(item.widthMm)}
                      disabled={busyItemId === item.id}
                    />
                    <input
                      name="heightCm"
                      type="number"
                      min={MIN_DIMENSION_CM}
                      max={MAX_DIMENSION_CM}
                      step={0.1}
                      placeholder="Height (cm)"
                      aria-label="Height in centimetres"
                      defaultValue={mmToCmInput(item.heightMm)}
                      disabled={busyItemId === item.id}
                    />
                    <input
                      name="lengthCm"
                      type="number"
                      min={MIN_DIMENSION_CM}
                      max={MAX_DIMENSION_CM}
                      step={0.1}
                      placeholder="Length (cm)"
                      aria-label="Length in centimetres"
                      defaultValue={mmToCmInput(item.lengthMm)}
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
                      <a
                        className={s.actionBtn}
                        href={itemArViewerUrl(item.publicSlug)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View in AR
                      </a>
                    )}
                    {(item.qrIssuedAt || item.arStatus === 'live') && (
                      <button
                        type="button"
                        className={s.actionBtn}
                        onClick={() => setQrItem(item)}
                      >
                        Show QR code
                      </button>
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
              Cuisine type
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
              Width (cm)
              <input
                type="number"
                min={MIN_DIMENSION_CM}
                max={MAX_DIMENSION_CM}
                step={0.1}
                value={itemWidthCm}
                onChange={(e) => setItemWidthCm(e.target.value)}
                placeholder="e.g. 26 for a 26 cm plate"
              />
            </label>
            <label>
              Height (cm)
              <input
                type="number"
                min={MIN_DIMENSION_CM}
                max={MAX_DIMENSION_CM}
                step={0.1}
                value={itemHeightCm}
                onChange={(e) => setItemHeightCm(e.target.value)}
              />
            </label>
            <label>
              Length (cm)
              <input
                type="number"
                min={MIN_DIMENSION_CM}
                max={MAX_DIMENSION_CM}
                step={0.1}
                value={itemLengthCm}
                onChange={(e) => setItemLengthCm(e.target.value)}
              />
            </label>
          </div>
          <p className={s.addDishNote}>
            Measure the dish as served, in centimetres (a 26 cm plate is 26). Dimensions can be added
            later, but width is required before generating a 3D model — the model is scaled to exactly
            this size in AR.
          </p>
          <button type="submit" className={s.addDishSubmit}>
            Add dish
          </button>
        </form>
      </section>
    </AppShell>
  );
}
