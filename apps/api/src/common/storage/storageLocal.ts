import fs from 'fs';
import path from 'path';
import { IStorageDriver, UploadResult } from './storage.types';

export class LocalStorageDriver implements IStorageDriver {
  root: string;
  publicBase: string;
  constructor() {
    this.root = process.env.LOCAL_STORAGE_ROOT || path.resolve(process.cwd(), 'storage');
    this.publicBase = process.env.LOCAL_PUBLIC_BASE || '/files';
  }

  async save(params: { key: string; buffer: Buffer; mimeType: string }) {
    const filePath = path.join(this.root, params.key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, params.buffer);
    return {
      storageKey: params.key,
      publicUrl: `${this.publicBase}/${params.key}`.replace(/\\/g, '/'),
      size: params.buffer.length,
      mimeType: params.mimeType,
      filename: path.basename(params.key),
    };
  }

  async remove(params: { key: string }): Promise<void> {
    const filePath = path.join(this.root, params.key);
    try { await fs.promises.unlink(filePath); } catch (_) {}
  }

  getPublicUrl(params: { key: string }): string {
    return `${this.publicBase}/${params.key}`.replace(/\\/g, '/');
  }
}
