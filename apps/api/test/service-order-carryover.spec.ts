import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceOrderCarryoverService } from '../src/modules/service-orders/service-order-carryover.service';

test('reconcileAssetTimelines processes active destinations chronologically', async () => {
  const service = new ServiceOrderCarryoverService();
  const calls: string[] = [];
  const projectedOrderIds: string[][] = [];
  const orders = [
    { id: 'late', status: 'OPEN', dueDate: new Date('2026-03-03T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z'), formData: {} },
    { id: 'canceled', status: 'CANCELED', dueDate: new Date('2026-03-01T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z'), formData: {} },
    { id: 'early', status: 'SCHEDULED', dueDate: new Date('2026-03-01T00:00:00Z'), createdAt: new Date('2026-01-02T00:00:00Z'), formData: {} },
    { id: 'middle', status: 'ON_HOLD', dueDate: new Date('2026-03-02T00:00:00Z'), createdAt: new Date('2026-01-03T00:00:00Z'), formData: {} },
    { id: 'closed', status: 'COMPLETED', dueDate: new Date('2026-02-28T00:00:00Z'), createdAt: new Date('2026-01-01T00:00:00Z'), formData: {} },
  ];
  const tx = {
    workOrder: {
      findMany: async () => orders,
    },
  };

  (service as any).projectIssueNotesForOrders = async (_tx: any, _tenantId: string, projected: any[]) => {
    projectedOrderIds.push(projected.map((order) => order.id));
  };
  (service as any).reconcileDestination = async (_tx: any, _tenantId: string, orderId: string) => {
    calls.push(orderId);
    return {
      copiedParts: orderId === 'late' ? 1 : 0,
      copiedIssueNotes: orderId === 'middle' ? 1 : 0,
      removedParts: 0,
      removedIssueNotes: 0,
    };
  };

  const result = await service.reconcileAssetTimelines(tx, 'tenant-1', ['ASSET-1', 'ASSET-1'], 'test');

  assert.deepEqual(calls, ['early', 'middle', 'late']);
  assert.deepEqual(projectedOrderIds, [orders.map((order) => order.id)]);
  assert.deepEqual(result, {
    copiedParts: 1,
    copiedIssueNotes: 1,
    removedParts: 0,
    removedIssueNotes: 0,
    reconciledOrders: 3,
  });
});

test('collectPendingPartBranchIds follows every pending descendant', async () => {
  const service = new ServiceOrderCarryoverService();
  const childrenBySource = new Map<string, string[]>([
    ['part-a', ['part-b', 'part-c']],
    ['part-b', ['part-d']],
    ['part-c', []],
    ['part-d', ['part-e']],
  ]);
  const tx = {
    serviceOrderPart: {
      findMany: async ({ where }: any) => {
        const sourceIds = where.sourceServiceOrderPartId.in as string[];
        return sourceIds.flatMap((sourceId) =>
          (childrenBySource.get(sourceId) ?? []).map((id) => ({ id })),
        );
      },
    },
  };

  const result = await (service as any).collectPendingPartBranchIds(tx, 'tenant-1', 'part-a');

  assert.deepEqual(new Set(result), new Set(['part-a', 'part-b', 'part-c', 'part-d', 'part-e']));
});

test('removePendingIssueNoteBranches removes descendants and preserves unrelated notes', async () => {
  const service = new ServiceOrderCarryoverService();
  const records = [
    { id: 'so-a:note-a', workOrderId: 'so-a', noteId: 'note-a', sourceRecordId: null },
    { id: 'so-b:note-b', workOrderId: 'so-b', noteId: 'note-b', sourceRecordId: 'so-a:note-a' },
    { id: 'so-c:note-c', workOrderId: 'so-c', noteId: 'note-c', sourceRecordId: 'so-b:note-b' },
  ];
  const formDataByWorkOrder = new Map<string, any>([
    ['so-a', { issueNotes: [{ id: 'note-a', text: 'A', stage: 'PENDING' }] }],
    ['so-b', { issueNotes: [{ id: 'note-b', text: 'B', stage: 'PENDING' }] }],
    ['so-c', {
      issueNotes: [
        { id: 'note-c', text: 'C', stage: 'PENDING' },
        { id: 'unrelated', text: 'Conservar', stage: 'PENDING' },
      ],
    }],
  ]);
  const synced = new Map<string, any[]>();
  const tx = {
    serviceOrderIssueNote: {
      findMany: async ({ where }: any) => {
        if (Array.isArray(where.OR)) {
          const frontier = new Set<string>(where.OR[0]?.sourceRecordId?.in ?? []);
          return records.filter((record) => record.sourceRecordId && frontier.has(record.sourceRecordId));
        }
        const ids = new Set<string>(where.id?.in ?? []);
        return records.filter((record) => ids.has(record.id));
      },
    },
    workOrder: {
      findFirst: async ({ where }: any) => ({ formData: formDataByWorkOrder.get(where.id) }),
      update: async ({ where, data }: any) => {
        formDataByWorkOrder.set(where.id, data.formData);
        return { id: where.id };
      },
    },
  };
  (service as any).syncIssueNotesForWorkOrder = async (
    _tx: any,
    _tenantId: string,
    workOrderId: string,
    notes: any[],
  ) => {
    synced.set(workOrderId, notes);
    return [];
  };

  const removed = await (service as any).removePendingIssueNoteBranches(
    tx,
    'tenant-1',
    ['so-a:note-a'],
  );

  assert.equal(removed, 3);
  assert.deepEqual(synced.get('so-a'), []);
  assert.deepEqual(synced.get('so-b'), []);
  assert.deepEqual(synced.get('so-c')?.map((note) => note.id), ['unrelated']);
});

test('effectiveServiceOrderDate prefers dueDate and falls back to createdAt', () => {
  const service = new ServiceOrderCarryoverService();
  const dueDate = new Date('2026-05-10T00:00:00Z');
  const createdAt = new Date('2026-04-10T00:00:00Z');

  assert.equal(service.effectiveServiceOrderDate({ dueDate, createdAt })?.toISOString(), dueDate.toISOString());
  assert.equal(service.effectiveServiceOrderDate({ createdAt })?.toISOString(), createdAt.toISOString());
  assert.equal(service.effectiveServiceOrderDate({ dueDate: 'invalid' }), null);
});
