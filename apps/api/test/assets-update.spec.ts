import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetsService } from '../src/modules/assets/assets.service';
import { tenantStorage } from '../src/common/tenant-context';

for (const [label, value, expected] of [
  ['preserves an omitted acquisition date', undefined, undefined],
  ['clears an acquisition date', null, null],
  ['updates an acquisition date', '2026-09-20', new Date('2026-09-20')],
] as const) {
  test(`asset update ${label}`, async () => {
    let update: any;
    const tx = {
      $executeRaw: async () => 0,
      asset: {
        findFirst: async () => ({ id: 'asset-1', serialNumber: null }),
        update: async (args: any) => { update = args; return args.data; },
      },
    };
    const prisma = { $transaction: async (fn: any) => fn(tx) };
    const service = new AssetsService(prisma as any, {} as any);
    await tenantStorage.run({ tenantId: 'tenant-1' }, () =>
      service.update('asset-1', { acquiredOn: value } as any));
    assert.deepEqual(update.data.acquiredOn, expected);
    assert.equal(update.data.name, undefined);
    assert.equal(update.where.id, 'asset-1');
  });
}
