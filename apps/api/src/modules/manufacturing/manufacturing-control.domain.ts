export type ControlRow = {
  id: string; number: string; projectName: string; status: string; orderType: string;
  requestedDeliveryAt?: Date | string | null; responsibleUser?: { name: string };
  holdReason?: string | null; executionMode: string;
  units: Array<{ id: string; unitNumber: number; status: string }>;
  engineeringReleases: Array<{ status: string }>;
  supplyPlans: Array<{ requirements: Array<{ status: string; included: boolean; expectedAt?: Date | string | null }> }>;
  kits: Array<{ id: string; manufacturedUnitId: string; status: string }>;
  assemblyExecutions: Array<{ kitId: string; status: string; operations: Array<{ status: string; blockedReason?: string | null }> }>;
  fatExecutions: Array<{ manufacturedUnitId: string; status: string; sequence: number; deviations: Array<{ status: string }> }>;
  dispatches: Array<{ manufacturedUnitId: string; status: string }>;
  siteDeployments: Array<{ manufacturedUnitId: string; status: string; assemblyExecutionId?: string | null }>;
  satExecutions: Array<{ manufacturedUnitId: string; status: string; sequence: number; deviations: Array<{ status: string; dueAt?: Date | string | null }> }>;
  handovers: Array<{ manufacturedUnitId: string; status: string; documents: Array<{ required: boolean; status: string }> }>;
  outputReceipts: Array<{ quantity: unknown }>;
  quickExecution?: { state: any } | null;
};

const stages = ['Ingeniería', 'Abastecimiento', 'Kits', 'Ensamble', 'FAT / Calidad', 'Despacho', 'Montaje en cliente', 'SAT', 'Entrega final', 'Completada'];
const actions = ['Completar y liberar ingeniería', 'Resolver materiales pendientes', 'Preparar y liberar kits', 'Completar operaciones de ensamble', 'Ejecutar y aprobar calidad', 'Preparar o entregar el despacho', 'Aceptar recepción y completar montaje', 'Ejecutar SAT y cerrar pendientes', 'Completar expediente y aceptación del cliente', 'Proceso finalizado'];
const open = (status: string) => ['OPEN', 'IN_REWORK'].includes(status);
const late = (date: Date | string | null | undefined, now: Date) => !!date && new Date(date).getTime() < now.getTime();

export function manufacturingControl(row: ControlRow, now = new Date()) {
  const terminal = ['COMPLETED', 'CANCELED'].includes(row.status);
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (row.status === 'ON_HOLD') blockers.push(row.holdReason || 'Orden en pausa');
  const units = row.units.filter(u => u.status !== 'CANCELED');
  let nextAction = '';
  let unitProgress: Array<{ id: string; unitNumber: number; stage: string; progress: number }> = [];
  let stage = 0;
  if (row.executionMode === 'EXPEDITED') {
    const state = row.quickExecution?.state;
    const quickStages: Record<string, number> = { PENDING_MATERIALS: 1, READY_FOR_PRODUCTION: 2, IN_PRODUCTION: 3, QUALITY_PENDING: 4, PARTIALLY_ACCEPTED: 4, REWORK_REQUIRED: 4, READY: 8, COMPLETED: 9 };
    stage = quickStages[state?.status] ?? 0;
    if (!state) blockers.push('La orden no tiene ejecución rápida');
    if (state?.status === 'PENDING_MATERIALS') blockers.push('Faltan materiales por reservar');
    if (state?.status === 'REWORK_REQUIRED') blockers.push('Calidad requiere retrabajo');
    nextAction = stage === 8 ? 'Recibir o entregar las piezas aprobadas' : stage === 2 ? 'Liberar fabricación' : actions[stage];
    const approved = new Set<string>((state?.inspections || []).filter((i: any) => i.passed).flatMap((i: any) => i.unitIds || []));
    // Receipts record quantities, not unit identities: never invent which serial was delivered.
    unitProgress = units.map(u => ({ ...u, stage: approved.has(u.id) ? 'Calidad aprobada' : stages[stage], progress: state?.status === 'COMPLETED' ? 100 : approved.has(u.id) ? 80 : Math.round(stage * 100 / 9) }));
  } else {
    const released = row.engineeringReleases.some(r => r.status === 'RELEASED');
    const requirements = row.supplyPlans.flatMap(p => p.requirements).filter(r => r.included && r.status !== 'CANCELED');
    const missing = requirements.filter(r => r.status !== 'FULFILLED');
    const supplyReady = row.supplyPlans.length > 0 && missing.length === 0;
    if (missing.length) blockers.push(`${missing.length} líneas de abastecimiento pendientes`);
    const overdue = missing.filter(r => late(r.expectedAt, now)).length;
    if (overdue) warnings.push(`${overdue} compromisos de abastecimiento vencidos`);
    const blockedOperations = row.assemblyExecutions.flatMap(e => e.operations).filter(o => o.status === 'BLOCKED');
    if (blockedOperations.length) blockers.push(`${blockedOperations.length} operaciones bloqueadas`);
    unitProgress = units.map(unit => {
      const kit = row.kits.find(k => k.manufacturedUnitId === unit.id && k.status !== 'CANCELED');
      const assembly = row.assemblyExecutions.find(e => e.kitId === kit?.id && e.status !== 'CANCELED');
      const fat = row.fatExecutions.filter(f => f.manufacturedUnitId === unit.id).sort((a, b) => b.sequence - a.sequence)[0];
      const dispatch = row.dispatches.find(d => d.manufacturedUnitId === unit.id && d.status !== 'CANCELED');
      const site = row.siteDeployments.find(d => d.manufacturedUnitId === unit.id && d.status !== 'CANCELED');
      const sat = row.satExecutions.filter(s => s.manufacturedUnitId === unit.id).sort((a, b) => b.sequence - a.sequence)[0];
      const handover = row.handovers.find(h => h.manufacturedUnitId === unit.id && h.status !== 'CANCELED');
      if (fat?.deviations.some(d => open(d.status))) blockers.push(`Unidad ${unit.unitNumber}: desviaciones FAT abiertas`);
      if (site?.status === 'RECEPTION_BLOCKED') blockers.push(`Unidad ${unit.unitNumber}: recepción bloqueada`);
      if (sat?.deviations.some(d => open(d.status))) blockers.push(`Unidad ${unit.unitNumber}: pendientes SAT abiertos`);
      if (sat?.deviations.some(d => open(d.status) && late(d.dueAt, now))) warnings.push(`Unidad ${unit.unitNumber}: compromiso SAT vencido`);
      const documents = handover?.documents.filter(d => d.required && d.status === 'PENDING').length || 0;
      if (documents) blockers.push(`Unidad ${unit.unitNumber}: ${documents} documentos de entrega pendientes`);
      // A shortage for another unit must not move an already assembled/shipped
      // unit back to procurement. Derive its milestone from its own evidence.
      let index = fat?.status === 'APPROVED' ? 5 : assembly?.status === 'COMPLETED' ? 4 : kit?.status === 'RELEASED' ? 3 : kit || supplyReady ? 2 : released ? 1 : 0;
      if (index === 5 && row.orderType === 'SPARE_PART') index = row.status === 'COMPLETED' ? 9 : 8;
      else if (index === 5 && dispatch?.status === 'DELIVERED') index = !site || !['READY_FOR_SAT', 'SAT_IN_PROGRESS', 'ACCEPTED', 'ACCEPTED_WITH_PENDING_ITEMS'].includes(site.status) ? 6 : sat?.status !== 'ACCEPTED' ? 7 : handover?.status !== 'CLOSED' ? 8 : 9;
      return { id: unit.id, unitNumber: unit.unitNumber, stage: stages[index], progress: Math.round(index * 100 / 9) };
    });
    stage = unitProgress.length ? Math.min(...unitProgress.map(u => stages.indexOf(u.stage))) : 0;
    nextAction = row.orderType === 'SPARE_PART' && stage === 8 ? 'Recibir producto terminado' : actions[stage];
  }
  if (!units.length && !terminal) blockers.push('La orden no tiene unidades activas');
  const overdue = !terminal && late(row.requestedDeliveryAt, now);
  if (overdue) warnings.push('Fecha solicitada de entrega vencida');
  const dueSoon = !terminal && !!row.requestedDeliveryAt && new Date(row.requestedDeliveryAt).getTime() - now.getTime() <= 7 * 86400000;
  if (terminal) { blockers.length = 0; warnings.length = 0; }
  const progress = row.status === 'COMPLETED' ? 100 : unitProgress.length ? Math.round(unitProgress.reduce((sum, u) => sum + u.progress, 0) / unitProgress.length) : 0;
  return {
    id: row.id, number: row.number, projectName: row.projectName, status: row.status,
    responsible: row.responsibleUser?.name || 'Sin responsable', requestedDeliveryAt: row.requestedDeliveryAt,
    stage: row.status === 'CANCELED' ? 'Cancelada' : row.status === 'COMPLETED' ? 'Completada' : stages[stage], progress,
    nextAction: terminal ? 'Proceso cerrado' : row.status === 'ON_HOLD' ? 'Resolver motivo de pausa y reanudar' : nextAction,
    blockers, warnings, risk: terminal ? 'CLOSED' : overdue || blockers.length ? 'HIGH' : dueSoon ? 'MEDIUM' : 'LOW',
    units: unitProgress, calculatedAt: now.toISOString(),
  };
}
