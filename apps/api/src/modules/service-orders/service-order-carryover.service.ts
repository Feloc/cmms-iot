import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type PendingCarryoverDestination = {
  id: string;
  assetCode: string;
  formData?: any;
  dueDate?: any;
  createdAt?: any;
};

export type PendingCarryoverResult = {
  copiedParts: number;
  copiedIssueNotes: number;
};

export type PendingCarryoverReconcileResult = PendingCarryoverResult & {
  removedParts: number;
  removedIssueNotes: number;
};

export type PendingCarryoverTimelineResult = PendingCarryoverReconcileResult & {
  reconciledOrders: number;
};

export type ServiceOrderIssueNoteStage = 'PENDING' | 'EXECUTED';

@Injectable()
export class ServiceOrderCarryoverService {
  normalizeIssueNoteStage(value: any): ServiceOrderIssueNoteStage {
    return String(value || '').trim().toUpperCase() === 'EXECUTED' ? 'EXECUTED' : 'PENDING';
  }

  normalizeIssueNotes(value: any): any[] {
    const raw = Array.isArray(value) ? value : [];
    return raw
      .map((note: any) => ({
        ...(note && typeof note === 'object' ? note : {}),
        id: String(note?.id || '').trim(),
        text: String(note?.text || '').trim(),
        stage: this.normalizeIssueNoteStage(note?.stage),
      }))
      .filter((note: any) => note.id && note.text);
  }

  issueNoteKey(serviceOrderId: any, noteId: any): string {
    const soId = String(serviceOrderId || '').trim();
    const nId = String(noteId || '').trim();
    return soId && nId ? `${soId}:${nId}` : '';
  }

  issueNoteRecordId(serviceOrderId: any, noteId: any): string {
    return this.issueNoteKey(serviceOrderId, noteId);
  }

  private optionalDate(value: any): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  issueNoteRecordToJson(record: any): any {
    return {
      id: String(record?.noteId || '').trim(),
      text: String(record?.text || '').trim(),
      stage: this.normalizeIssueNoteStage(record?.stage),
      createdAt: record?.createdAt ? new Date(record.createdAt).toISOString() : null,
      createdByUserId: record?.createdByUserId ?? null,
      createdByName: record?.createdByName ?? null,
      executedAt: record?.executedAt ? new Date(record.executedAt).toISOString() : null,
      executedByUserId: record?.executedByUserId ?? null,
      executedByName: record?.executedByName ?? null,
      sourceServiceOrderId: record?.sourceServiceOrderId ?? null,
      sourceIssueNoteId: record?.sourceIssueNoteId ?? null,
      executedServiceOrderId: record?.executedServiceOrderId ?? null,
      executedIssueNoteId: record?.executedIssueNoteId ?? null,
      copiedAt: record?.copiedAt ? new Date(record.copiedAt).toISOString() : null,
      copiedReason: record?.copiedReason ?? null,
    };
  }

  async syncIssueNotesForWorkOrder(
    tx: any,
    tenantId: string,
    workOrderId: string,
    value: any,
  ): Promise<any[]> {
    const notes = this.normalizeIssueNotes(value);
    const recordIds = notes.map((note: any) => this.issueNoteRecordId(workOrderId, note.id));

    for (const note of notes) {
      const recordId = this.issueNoteRecordId(workOrderId, note.id);
      const createdAt = this.optionalDate(note.createdAt) ?? new Date();
      const sourceServiceOrderId = String(note?.sourceServiceOrderId || '').trim() || null;
      const sourceIssueNoteId = String(note?.sourceIssueNoteId || '').trim() || null;
      const executedServiceOrderId = String(note?.executedServiceOrderId || '').trim() || null;
      const executedIssueNoteId = String(note?.executedIssueNoteId || '').trim() || null;
      const data = {
        tenantId,
        workOrderId,
        noteId: String(note.id),
        text: String(note.text),
        stage: this.normalizeIssueNoteStage(note.stage),
        createdAt,
        createdByUserId: String(note?.createdByUserId || '').trim() || null,
        createdByName: String(note?.createdByName || '').trim() || null,
        executedAt: this.optionalDate(note?.executedAt),
        executedByUserId: String(note?.executedByUserId || '').trim() || null,
        executedByName: String(note?.executedByName || '').trim() || null,
        sourceServiceOrderId,
        sourceIssueNoteId: sourceServiceOrderId ? sourceIssueNoteId : null,
        sourceRecordId: null,
        executedServiceOrderId,
        executedIssueNoteId: executedServiceOrderId ? executedIssueNoteId : null,
        executedRecordId: null,
        copiedAt: this.optionalDate(note?.copiedAt),
        copiedReason: String(note?.copiedReason || '').trim() || null,
      };
      await tx.serviceOrderIssueNote.upsert({
        where: { id: recordId },
        create: { id: recordId, ...data },
        update: data,
      });
    }

    await tx.serviceOrderIssueNote.deleteMany({
      where: {
        tenantId,
        workOrderId,
        ...(recordIds.length > 0 ? { id: { notIn: recordIds } } : {}),
      },
    });

    const referenceIds = Array.from(new Set(notes.flatMap((note: any) => {
      const ids: string[] = [];
      if (note?.sourceServiceOrderId && note?.sourceIssueNoteId) {
        ids.push(this.issueNoteRecordId(note.sourceServiceOrderId, note.sourceIssueNoteId));
      }
      if (note?.executedServiceOrderId && note?.executedIssueNoteId) {
        ids.push(this.issueNoteRecordId(note.executedServiceOrderId, note.executedIssueNoteId));
      }
      return ids;
    })));
    const existingReferences = referenceIds.length > 0
      ? await tx.serviceOrderIssueNote.findMany({
          where: { tenantId, id: { in: referenceIds } },
          select: { id: true },
        })
      : [];
    const existingReferenceIds = new Set<string>(existingReferences.map((record: any) => String(record.id)));

    for (const note of notes) {
      const sourceRecordId = note?.sourceServiceOrderId && note?.sourceIssueNoteId
        ? this.issueNoteRecordId(note.sourceServiceOrderId, note.sourceIssueNoteId)
        : null;
      const executedRecordId = note?.executedServiceOrderId && note?.executedIssueNoteId
        ? this.issueNoteRecordId(note.executedServiceOrderId, note.executedIssueNoteId)
        : null;
      await tx.serviceOrderIssueNote.update({
        where: { id: this.issueNoteRecordId(workOrderId, note.id) },
        data: {
          sourceRecordId: sourceRecordId && existingReferenceIds.has(sourceRecordId) ? sourceRecordId : null,
          executedRecordId: executedRecordId && existingReferenceIds.has(executedRecordId) ? executedRecordId : null,
        },
      });
    }

    return tx.serviceOrderIssueNote.findMany({
      where: { tenantId, workOrderId },
      orderBy: [{ createdAt: 'asc' }, { noteId: 'asc' }],
    });
  }

  async projectIssueNotesForOrders(tx: any, tenantId: string, orders: any[]): Promise<void> {
    const uniqueOrders: any[] = Array.from(
      new Map<string, any>(
        (orders ?? [])
          .filter((order: any) => order?.id)
          .map((order: any): [string, any] => [String(order.id), order]),
      ).values(),
    );
    for (const order of uniqueOrders) {
      const formData = order?.formData && typeof order.formData === 'object' ? order.formData : {};
      await this.syncIssueNotesForWorkOrder(tx, tenantId, String(order.id), (formData as any).issueNotes);
    }

    const workOrderIds = uniqueOrders.map((order: any) => String(order.id));
    if (workOrderIds.length === 0) return;
    const records = await tx.serviceOrderIssueNote.findMany({
      where: { tenantId, workOrderId: { in: workOrderIds } },
      select: {
        id: true,
        sourceServiceOrderId: true,
        sourceIssueNoteId: true,
        sourceRecordId: true,
        executedServiceOrderId: true,
        executedIssueNoteId: true,
        executedRecordId: true,
      },
    });
    const referenceIds = Array.from(new Set<string>(records.flatMap((record: any) => [
      this.issueNoteRecordId(record.sourceServiceOrderId, record.sourceIssueNoteId),
      this.issueNoteRecordId(record.executedServiceOrderId, record.executedIssueNoteId),
    ]).filter(Boolean)));
    const references = referenceIds.length > 0
      ? await tx.serviceOrderIssueNote.findMany({
          where: { tenantId, id: { in: referenceIds } },
          select: { id: true },
        })
      : [];
    const existingReferenceIds = new Set<string>(references.map((record: any) => String(record.id)));

    // Resuelve referencias que no existían todavía cuando se proyectó primero la OS hija.
    for (const record of records) {
      const sourceRecordId = this.issueNoteRecordId(record.sourceServiceOrderId, record.sourceIssueNoteId);
      const executedRecordId = this.issueNoteRecordId(record.executedServiceOrderId, record.executedIssueNoteId);
      const nextSourceRecordId = sourceRecordId && existingReferenceIds.has(sourceRecordId) ? sourceRecordId : null;
      const nextExecutedRecordId = executedRecordId && existingReferenceIds.has(executedRecordId) ? executedRecordId : null;
      if (
        String(record.sourceRecordId || '') === String(nextSourceRecordId || '') &&
        String(record.executedRecordId || '') === String(nextExecutedRecordId || '')
      ) continue;
      await tx.serviceOrderIssueNote.update({
        where: { id: record.id },
        data: { sourceRecordId: nextSourceRecordId, executedRecordId: nextExecutedRecordId },
      });
    }
  }

  effectiveServiceOrderDate(order: any): Date | null {
    const raw = order?.dueDate ?? order?.createdAt ?? null;
    if (!raw) return null;
    const date = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private isSourceBeforeDestination(source: any, destination: any): boolean {
    const sourceDate = this.effectiveServiceOrderDate(source);
    const destinationDate = this.effectiveServiceOrderDate(destination);
    if (!sourceDate || !destinationDate) return false;
    if (sourceDate.getTime() !== destinationDate.getTime()) return sourceDate.getTime() < destinationDate.getTime();
    const sourceCreatedAt = new Date(source?.createdAt ?? 0).getTime();
    const destinationCreatedAt = new Date(destination?.createdAt ?? 0).getTime();
    return sourceCreatedAt < destinationCreatedAt;
  }

  private async lockAsset(tx: any, tenantId: string, assetCode: string): Promise<void> {
    if (typeof tx?.$queryRawUnsafe !== 'function') return;
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))::text AS lock_result',
      `${tenantId}:${assetCode}:pending-carryovers`,
    );
  }

  async carryForwardFromSource(
    tx: any,
    tenantId: string,
    sourceServiceOrderId: string,
    reason: string,
  ): Promise<PendingCarryoverResult> {
    const source = await tx.workOrder.findFirst({
      where: { id: sourceServiceOrderId, tenantId, kind: 'SERVICE_ORDER' },
      select: { id: true, assetCode: true, dueDate: true, createdAt: true },
    });
    if (!source?.assetCode) return { copiedParts: 0, copiedIssueNotes: 0 };

    const activeOrders = await tx.workOrder.findMany({
      where: {
        tenantId,
        kind: 'SERVICE_ORDER',
        assetCode: source.assetCode,
        id: { not: source.id },
        status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD'] },
      },
      select: { id: true, assetCode: true, formData: true, dueDate: true, createdAt: true },
    });
    const nextOrder = activeOrders
      .filter((order: any) => this.isSourceBeforeDestination(source, order))
      .sort((left: any, right: any) => {
        const leftDate = this.effectiveServiceOrderDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDate = this.effectiveServiceOrderDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (leftDate !== rightDate) return leftDate - rightDate;
        return new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime();
      })[0];
    if (!nextOrder) return { copiedParts: 0, copiedIssueNotes: 0 };
    return this.attachPending(tx, tenantId, nextOrder, reason);
  }

  async reconcileAssetTimelines(
    tx: any,
    tenantId: string,
    assetCodes: Array<string | null | undefined>,
    reason: string,
  ): Promise<PendingCarryoverTimelineResult> {
    const codes = Array.from(
      new Set(assetCodes.map((code) => String(code || '').trim()).filter(Boolean)),
    );
    const result: PendingCarryoverTimelineResult = {
      copiedParts: 0,
      copiedIssueNotes: 0,
      removedParts: 0,
      removedIssueNotes: 0,
      reconciledOrders: 0,
    };

    for (const assetCode of codes) {
      await this.lockAsset(tx, tenantId, assetCode);
      const orders = await tx.workOrder.findMany({
        where: {
          tenantId,
          kind: 'SERVICE_ORDER',
          assetCode,
        },
        select: { id: true, status: true, dueDate: true, createdAt: true, formData: true },
      });
      await this.projectIssueNotesForOrders(tx, tenantId, orders);
      const destinations = orders.filter((order: any) =>
        ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD'].includes(String(order.status || '').toUpperCase()),
      );
      destinations.sort((left: any, right: any) => {
        const leftDate = this.effectiveServiceOrderDate(left)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const rightDate = this.effectiveServiceOrderDate(right)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (leftDate !== rightDate) return leftDate - rightDate;
        return new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime();
      });

      for (const destination of destinations) {
        const reconciled = await this.reconcileDestination(
          tx,
          tenantId,
          String(destination.id),
          `${reason}:${assetCode}`,
          { issueNotesProjected: true },
        );
        result.copiedParts += reconciled.copiedParts;
        result.copiedIssueNotes += reconciled.copiedIssueNotes;
        result.removedParts += reconciled.removedParts;
        result.removedIssueNotes += reconciled.removedIssueNotes;
        result.reconciledOrders += 1;
      }
    }

    return result;
  }

  private async collectPendingPartBranchIds(
    tx: any,
    tenantId: string,
    rootPartId: string,
  ): Promise<string[]> {
    const collected = new Set<string>([rootPartId]);
    let frontier = [rootPartId];
    while (frontier.length > 0) {
      const children = await tx.serviceOrderPart.findMany({
        where: {
          tenantId,
          stage: 'REQUIRED',
          sourceServiceOrderPartId: { in: frontier },
        },
        select: { id: true },
      });
      frontier = children
        .map((part: any) => String(part.id))
        .filter((partId: string) => !collected.has(partId));
      for (const partId of frontier) collected.add(partId);
    }
    return Array.from(collected);
  }

  private async removePendingIssueNoteBranches(
    tx: any,
    tenantId: string,
    rootRecordIds: string[],
  ): Promise<number> {
    const collected = new Set<string>(rootRecordIds.filter(Boolean));
    let frontier = Array.from(collected);
    while (frontier.length > 0) {
      const children = await tx.serviceOrderIssueNote.findMany({
        where: {
          tenantId,
          stage: 'PENDING',
          OR: [
            { sourceRecordId: { in: frontier } },
            ...frontier.map((recordId) => {
              const separator = recordId.indexOf(':');
              return separator > 0
                ? {
                    sourceServiceOrderId: recordId.slice(0, separator),
                    sourceIssueNoteId: recordId.slice(separator + 1),
                  }
                : { id: '__invalid_issue_note_reference__' };
            }),
          ],
        },
        select: { id: true },
      });
      frontier = children
        .map((record: any) => String(record.id))
        .filter((recordId: string) => !collected.has(recordId));
      for (const recordId of frontier) collected.add(recordId);
    }
    if (collected.size === 0) return 0;

    const records = await tx.serviceOrderIssueNote.findMany({
      where: { tenantId, id: { in: Array.from(collected) } },
      select: { workOrderId: true, noteId: true },
    });
    const noteIdsByWorkOrder = new Map<string, Set<string>>();
    for (const record of records) {
      const noteIds = noteIdsByWorkOrder.get(String(record.workOrderId)) ?? new Set<string>();
      noteIds.add(String(record.noteId));
      noteIdsByWorkOrder.set(String(record.workOrderId), noteIds);
    }

    for (const [workOrderId, noteIds] of noteIdsByWorkOrder) {
      const order = await tx.workOrder.findFirst({
        where: { id: workOrderId, tenantId, kind: 'SERVICE_ORDER' },
        select: { formData: true },
      });
      if (!order) continue;
      const formData = order.formData && typeof order.formData === 'object' ? order.formData : {};
      const nextNotes = this.normalizeIssueNotes((formData as any).issueNotes)
        .filter((note: any) => !noteIds.has(String(note.id)));
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { formData: { ...(formData as any), issueNotes: nextNotes } },
      });
      await this.syncIssueNotesForWorkOrder(tx, tenantId, workOrderId, nextNotes);
    }

    return records.length;
  }

  async reconcileDestination(
    tx: any,
    tenantId: string,
    destinationId: string,
    reason: string,
    options?: { issueNotesProjected?: boolean },
  ): Promise<PendingCarryoverReconcileResult> {
    const destination = await tx.workOrder.findFirst({
      where: { id: destinationId, tenantId, kind: 'SERVICE_ORDER' },
      select: { id: true, assetCode: true, formData: true, dueDate: true, createdAt: true },
    });
    if (!destination) {
      return { copiedParts: 0, copiedIssueNotes: 0, removedParts: 0, removedIssueNotes: 0 };
    }

    await this.lockAsset(tx, tenantId, String(destination.assetCode || ''));
    const carriedParts = await tx.serviceOrderPart.findMany({
      where: {
        tenantId,
        workOrderId: destination.id,
        stage: 'REQUIRED',
        sourceServiceOrderPartId: { not: null },
      },
      select: { id: true, sourceServiceOrderPartId: true },
    });
    const sourcePartIds = carriedParts
      .map((part: any) => String(part?.sourceServiceOrderPartId || '').trim())
      .filter((id: string) => id.length > 0);
    const sourceParts = sourcePartIds.length
      ? await tx.serviceOrderPart.findMany({
          where: { tenantId, id: { in: sourcePartIds } },
          select: {
            id: true,
            sourceServiceOrderPartId: true,
            workOrder: { select: { status: true, dueDate: true, createdAt: true, assetCode: true } },
          },
        })
      : [];
    const sourcePartById = new Map<string, any>(sourceParts.map((part: any) => [String(part.id), part]));
    const carriedPartIds = carriedParts.map((part: any) => String(part.id));
    const activeSiblingParts = sourcePartIds.length
      ? await tx.serviceOrderPart.findMany({
          where: {
            tenantId,
            sourceServiceOrderPartId: { in: sourcePartIds },
            id: { notIn: carriedPartIds },
            workOrder: { tenantId, kind: 'SERVICE_ORDER', status: { not: 'CANCELED' } },
          },
          select: { sourceServiceOrderPartId: true },
        })
      : [];
    const sourcePartIdsWithActiveSibling = new Set<string>(
      activeSiblingParts
        .map((part: any) => String(part?.sourceServiceOrderPartId || ''))
        .filter(Boolean),
    );

    const removablePartIds = new Set<string>();
    for (const carriedPart of carriedParts) {
      const carriedPartId = String((carriedPart as any).id);
      const sourcePartId = String((carriedPart as any).sourceServiceOrderPartId || '');
      if (sourcePartIdsWithActiveSibling.has(sourcePartId)) {
        const branchIds = await this.collectPendingPartBranchIds(tx, tenantId, carriedPartId);
        for (const branchId of branchIds) removablePartIds.add(branchId);
        continue;
      }
      const source = sourcePartById.get(sourcePartId);
      if (!source) {
        const branchIds = await this.collectPendingPartBranchIds(tx, tenantId, carriedPartId);
        for (const branchId of branchIds) removablePartIds.add(branchId);
        continue;
      }
      const sourceOrder = source.workOrder;
      const sameAsset = String(sourceOrder?.assetCode || '') === String(destination.assetCode || '');
      const canceledRoot =
        String(sourceOrder?.status || '').toUpperCase() === 'CANCELED' &&
        !String(source?.sourceServiceOrderPartId || '').trim();
      const stillEligible =
        sameAsset &&
        (String(sourceOrder?.status || '').toUpperCase() !== 'CANCELED' || canceledRoot) &&
        this.isSourceBeforeDestination(sourceOrder, destination);
      if (!stillEligible) {
        const branchIds = await this.collectPendingPartBranchIds(tx, tenantId, carriedPartId);
        for (const branchId of branchIds) removablePartIds.add(branchId);
        continue;
      }
    }
    if (removablePartIds.size > 0) {
      await tx.serviceOrderPart.deleteMany({
        where: { tenantId, id: { in: Array.from(removablePartIds) }, stage: 'REQUIRED' },
      });
    }

    const destinationFormData = destination.formData && typeof destination.formData === 'object' ? destination.formData : {};
    const destinationNotes = this.normalizeIssueNotes((destinationFormData as any).issueNotes);
    const carriedNotes = destinationNotes.filter(
      (note: any) => note.stage === 'PENDING' && note.sourceServiceOrderId && note.sourceIssueNoteId,
    );
    const allOrdersForAsset = carriedNotes.length
      ? await tx.workOrder.findMany({
          where: { tenantId, kind: 'SERVICE_ORDER', assetCode: destination.assetCode },
          select: { id: true, status: true, dueDate: true, createdAt: true, formData: true },
        })
      : [];
    if (!options?.issueNotesProjected) {
      await this.projectIssueNotesForOrders(tx, tenantId, [destination, ...allOrdersForAsset]);
    }
    const orderById = new Map<string, any>(allOrdersForAsset.map((order: any) => [String(order.id), order]));
    const sourceIssueNoteRecordIds = Array.from(new Set<string>(
      carriedNotes
        .map((note: any) => this.issueNoteRecordId(note.sourceServiceOrderId, note.sourceIssueNoteId))
        .filter(Boolean),
    ));
    const sourceIssueNoteRecords = sourceIssueNoteRecordIds.length > 0
      ? await tx.serviceOrderIssueNote.findMany({
          where: { tenantId, id: { in: sourceIssueNoteRecordIds } },
          select: { id: true, sourceRecordId: true, sourceServiceOrderId: true },
        })
      : [];
    const sourceIssueNoteRecordById = new Map<string, any>(
      sourceIssueNoteRecords.map((record: any): [string, any] => [String(record.id), record]),
    );
    const delegatedRows = carriedNotes.length > 0
      ? await tx.serviceOrderIssueNote.findMany({
          where: {
            tenantId,
            sourceServiceOrderId: { not: null },
            sourceIssueNoteId: { not: null },
            workOrder: { tenantId, kind: 'SERVICE_ORDER', assetCode: destination.assetCode, status: { not: 'CANCELED' } },
          },
          select: { id: true, workOrderId: true, sourceRecordId: true, sourceServiceOrderId: true, sourceIssueNoteId: true },
        })
      : [];
    const delegatedRowsBySourceKey = new Map<string, any[]>();
    for (const row of delegatedRows) {
      const sourceKey =
        String(row?.sourceRecordId || '').trim() ||
        this.issueNoteRecordId(row?.sourceServiceOrderId, row?.sourceIssueNoteId);
      if (!sourceKey) continue;
      const rows = delegatedRowsBySourceKey.get(sourceKey) ?? [];
      rows.push(row);
      delegatedRowsBySourceKey.set(sourceKey, rows);
    }

    const removableIssueNoteRootIds = new Set<string>();
    for (const note of carriedNotes) {
      const ownKey = this.issueNoteKey(destination.id, note.id);
      const sourceKey = this.issueNoteRecordId(note.sourceServiceOrderId, note.sourceIssueNoteId);
      const hasActiveSibling = (delegatedRowsBySourceKey.get(sourceKey) ?? [])
        .some((row: any) => String(row.workOrderId) !== String(destination.id));
      if (hasActiveSibling) {
        removableIssueNoteRootIds.add(ownKey);
        continue;
      }
      const sourceOrder = orderById.get(String(note.sourceServiceOrderId));
      if (!sourceOrder) {
        removableIssueNoteRootIds.add(ownKey);
        continue;
      }
      const sourceRecord = sourceIssueNoteRecordById.get(sourceKey);
      const canceledRoot =
        String(sourceOrder.status || '').toUpperCase() === 'CANCELED' &&
        !String(sourceRecord?.sourceRecordId || '').trim() &&
        !String(sourceRecord?.sourceServiceOrderId || '').trim();
      const stillEligible =
        (String(sourceOrder.status || '').toUpperCase() !== 'CANCELED' || canceledRoot) &&
        this.isSourceBeforeDestination(sourceOrder, destination);
      if (!stillEligible) removableIssueNoteRootIds.add(ownKey);
    }

    const removedIssueNotes = await this.removePendingIssueNoteBranches(
      tx,
      tenantId,
      Array.from(removableIssueNoteRootIds),
    );
    if (removedIssueNotes > 0) {
      const refreshedDestination = await tx.workOrder.findFirst({
        where: { id: destination.id, tenantId, kind: 'SERVICE_ORDER' },
        select: { formData: true },
      });
      destination.formData =
        refreshedDestination?.formData && typeof refreshedDestination.formData === 'object'
          ? refreshedDestination.formData
          : {};
    }

    const copied = await this.attachPending(tx, tenantId, destination, reason);
    return {
      ...copied,
      removedParts: removablePartIds.size,
      removedIssueNotes,
    };
  }

  async attachPending(
    tx: any,
    tenantId: string,
    destination: PendingCarryoverDestination,
    reason: string,
  ): Promise<PendingCarryoverResult> {
    const assetCode = String(destination?.assetCode || '').trim();
    if (!assetCode) return { copiedParts: 0, copiedIssueNotes: 0 };
    await this.lockAsset(tx, tenantId, assetCode);
    const destinationPartRows = await tx.serviceOrderPart.findMany({
      where: { tenantId, workOrderId: destination.id },
      select: { sourceServiceOrderPartId: true },
    });
    const destinationSourcePartIds = new Set<string>(
      (destinationPartRows ?? [])
        .map((part: any) => String(part?.sourceServiceOrderPartId || '').trim())
        .filter((id: string) => id.length > 0),
    );

    const sourcePartRows = await tx.serviceOrderPart.findMany({
      where: {
        tenantId,
        stage: 'REQUIRED',
        workOrderId: { not: destination.id },
        OR: [
          {
            workOrder: {
              tenantId,
              kind: 'SERVICE_ORDER',
              assetCode,
              status: { not: 'CANCELED' },
            },
          },
          {
            sourceServiceOrderPartId: null,
            workOrder: {
              tenantId,
              kind: 'SERVICE_ORDER',
              assetCode,
              status: 'CANCELED',
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        workOrderId: true,
        inventoryItemId: true,
        freeText: true,
        qty: true,
        notes: true,
        sourceServiceOrderPartId: true,
        workOrder: { select: { id: true, status: true, dueDate: true, createdAt: true } },
      },
    });
    const delegatedSourcePartIds = new Set<string>();
    for (const part of sourcePartRows ?? []) {
      const sourcePartId = String((part as any).sourceServiceOrderPartId || '').trim();
      if (sourcePartId) delegatedSourcePartIds.add(sourcePartId);
    }

    let copiedParts = 0;
    for (const part of sourcePartRows ?? []) {
      const partId = String((part as any).id || '').trim();
      if (!partId || delegatedSourcePartIds.has(partId) || destinationSourcePartIds.has(partId)) continue;

      if (!this.isSourceBeforeDestination((part as any).workOrder, destination)) continue;

      await tx.serviceOrderPart.create({
        data: {
          tenantId,
          workOrderId: destination.id,
          inventoryItemId: (part as any).inventoryItemId ?? undefined,
          freeText: (part as any).freeText ?? undefined,
          qty: (part as any).qty ?? 1,
          notes: (part as any).notes ?? undefined,
          stage: 'REQUIRED',
          sourceServiceOrderId: (part as any).workOrderId,
          sourceServiceOrderPartId: partId,
        },
      });
      destinationSourcePartIds.add(partId);
      copiedParts += 1;
    }

    const destinationFormData = destination?.formData && typeof destination.formData === 'object' ? destination.formData : {};
    const destinationNotes = this.normalizeIssueNotes((destinationFormData as any).issueNotes);
    const serviceOrders = await tx.workOrder.findMany({
      where: {
        tenantId,
        kind: 'SERVICE_ORDER',
        assetCode,
        id: { not: destination.id },
      },
      orderBy: [{ createdAt: 'asc' }],
      select: { id: true, status: true, dueDate: true, createdAt: true, formData: true },
    });
    await this.projectIssueNotesForOrders(tx, tenantId, [
      { id: destination.id, formData: destinationFormData },
      ...(serviceOrders ?? []),
    ]);

    const [destinationRecords, pendingRecords, delegatedRecords] = await Promise.all([
      tx.serviceOrderIssueNote.findMany({
        where: { tenantId, workOrderId: destination.id },
        select: { sourceRecordId: true, sourceServiceOrderId: true, sourceIssueNoteId: true },
      }),
      tx.serviceOrderIssueNote.findMany({
        where: {
          tenantId,
          stage: 'PENDING',
          workOrderId: { not: destination.id },
          OR: [
            {
              workOrder: {
                tenantId,
                kind: 'SERVICE_ORDER',
                assetCode,
                status: { not: 'CANCELED' },
              },
            },
            {
              sourceRecordId: null,
              sourceServiceOrderId: null,
              workOrder: {
                tenantId,
                kind: 'SERVICE_ORDER',
                assetCode,
                status: 'CANCELED',
              },
            },
          ],
        },
        include: {
          workOrder: { select: { id: true, status: true, dueDate: true, createdAt: true } },
        },
        orderBy: [{ createdAt: 'asc' }],
      }),
      tx.serviceOrderIssueNote.findMany({
        where: {
          tenantId,
          sourceServiceOrderId: { not: null },
          sourceIssueNoteId: { not: null },
          workOrder: { tenantId, kind: 'SERVICE_ORDER', assetCode, status: { not: 'CANCELED' } },
        },
        select: { sourceRecordId: true, sourceServiceOrderId: true, sourceIssueNoteId: true },
      }),
    ]);
    const referencedRecordId = (record: any) =>
      String(record?.sourceRecordId || '').trim() ||
      this.issueNoteRecordId(record?.sourceServiceOrderId, record?.sourceIssueNoteId);
    const destinationSourceRecordIds = new Set<string>(
      destinationRecords.map((record: any) => referencedRecordId(record)).filter(Boolean),
    );
    const delegatedSourceRecordIds = new Set<string>(
      delegatedRecords.map((record: any) => referencedRecordId(record)).filter(Boolean),
    );

    let copiedIssueNotes = 0;
    const nextDestinationNotes = [...destinationNotes];
    for (const candidate of pendingRecords ?? []) {
      const candidateRecordId = String(candidate?.id || '').trim();
      if (!candidateRecordId || delegatedSourceRecordIds.has(candidateRecordId) || destinationSourceRecordIds.has(candidateRecordId)) continue;
      if (!this.isSourceBeforeDestination(candidate.workOrder, destination)) continue;
      const candidateNote = this.issueNoteRecordToJson(candidate);

      nextDestinationNotes.push({
        ...candidateNote,
        id: randomUUID(),
        stage: 'PENDING',
        sourceServiceOrderId: candidate.workOrderId,
        sourceIssueNoteId: candidate.noteId,
        executedAt: null,
        executedByUserId: null,
        executedByName: null,
        executedServiceOrderId: null,
        executedIssueNoteId: null,
        copiedAt: new Date().toISOString(),
        copiedReason: reason,
      });
      destinationSourceRecordIds.add(candidateRecordId);
      copiedIssueNotes += 1;
    }

    if (copiedIssueNotes > 0) {
      await tx.workOrder.update({
        where: { id: destination.id },
        data: {
          formData: {
            ...(destinationFormData as any),
            issueNotes: nextDestinationNotes,
          },
        },
      });
      await this.syncIssueNotesForWorkOrder(tx, tenantId, destination.id, nextDestinationNotes);
    }

    return { copiedParts, copiedIssueNotes };
  }
}
