import { AsyncLocalStorage } from 'node:async_hooks';

type Store = { 
  tenantId?: string;
  userId?: string;
};

export const tenantStorage = new AsyncLocalStorage<Store>();

export function setTenant(tenantId?: string) {
  tenantStorage.enterWith({ tenantId });
}

export function getTenant(): string | undefined {
  return tenantStorage.getStore()?.tenantId;
}
