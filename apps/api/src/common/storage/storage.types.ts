export type UploadResult = {
  storageKey: string;
  publicUrl: string;
  size: number;
  mimeType: string;
  filename: string;
};

export interface IStorageDriver {
  save(params: { key: string; buffer: Buffer; mimeType: string }): Promise<UploadResult>;
  remove(params: { key: string }): Promise<void>;
  getPublicUrl(params: { key: string }): string;
}

export type StorageDriverName = 'local';
