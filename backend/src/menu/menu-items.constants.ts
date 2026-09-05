// Max input photos per dish (documents/3d-model-enhancement.md §1) — 1
// drives Tripo's single image-to-3D endpoint, 2-5 drive its multiview
// endpoint. Code constant, not env: this is a product/security policy
// (bounds per-item storage and upload work), not per-environment config.
export const MAX_ITEM_PHOTOS = 5;
