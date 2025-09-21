import { LocalStorageDriver } from './storageLocal';
import type { IStorageDriver, StorageDriverName } from './storage.types';

export function createStorage(): IStorageDriver {
  const driver = (process.env.STORAGE_DRIVER || 'local') as StorageDriverName;
  switch (driver) {
    case 'local':
    default:
      return new LocalStorageDriver();
  }
}
