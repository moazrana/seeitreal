export interface PutObjectParams {
  /** Full storage key, e.g. `menu-items/photos/<random>.webp`. Never the
   * user-supplied filename (spec §7.5). */
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageProvider {
  putObject(params: PutObjectParams): Promise<void>;
  deleteObject(key: string): Promise<void>;
  /** Public URL a diner's browser (or model-viewer) can load the object from. */
  getPublicUrl(key: string): string;
}
