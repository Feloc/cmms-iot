import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

export type Actor = { id: string; tenantId: string; role: string; name: string };
export function canView(task: any, actor: Actor): boolean {
  return task.tenantId === actor.tenantId && (task.createdByUserId === actor.id ||
    (task.visibility !== 'PRIVATE' && (task.visibility === 'PUBLIC' || task.responsibleUserId === actor.id ||
      task.participants?.some((p: any) => p.userId === actor.id))));
}
export function permissions(task: any, actor: Actor) {
  const write = canView(task, actor) && ['ADMIN', 'TECH'].includes(actor.role);
  const manage = write && task.createdByUserId === actor.id;
  return { manage, execute: write && (manage || task.responsibleUserId === actor.id),
    contribute: write && (manage || task.responsibleUserId === actor.id || task.participants?.some((p: any) => p.userId === actor.id && p.role === 'COLLABORATOR')) };
}
export function assertPermission(task: any, actor: Actor, kind: 'manage' | 'execute' | 'contribute') {
  if (!permissions(task, actor)[kind]) throw new ForbiddenException('No tienes permiso para esta acción');
}
export function assertNoCycle(taskId: string, predecessorId: string, edges: { taskId: string; predecessorId: string }[]) {
  const stack = [predecessorId], visited = new Set<string>();
  const graph = new Map<string, string[]>();
  for (const e of edges) graph.set(e.taskId, [...(graph.get(e.taskId) || []), e.predecessorId]);
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) throw new ConflictException('La dependencia formaría un ciclo');
    if (visited.has(id)) continue;
    visited.add(id); stack.push(...(graph.get(id) || []));
  }
}
export function validateConfiguration(input: any, creatorId: string) {
  if (input.visibility === 'PRIVATE' && ((input.responsibleUserId && input.responsibleUserId !== creatorId) || input.participants.length)) {
    throw new BadRequestException('Una tarea privada solo puede asignarse a su creador y no admite participantes. Cambia a selectiva para compartirla.');
  }
  if (new Set(input.participants.map((p: any) => p.userId)).size !== input.participants.length) throw new BadRequestException('Participantes duplicados');
  if (input.plannedStart && input.dueAt && new Date(input.plannedStart) > new Date(input.dueAt)) throw new BadRequestException('El vencimiento debe ser posterior al inicio previsto');
}
export function transition(task: any, action: string, note: string | undefined, blocked: boolean) {
  const from: Record<string, string[]> = { start: ['PENDING', 'PAUSED'], pause: ['IN_PROGRESS'], complete: ['IN_PROGRESS'], cancel: ['PENDING', 'IN_PROGRESS', 'PAUSED'], reopen: ['COMPLETED', 'CANCELED'] };
  const to: Record<string, string> = { start: 'IN_PROGRESS', pause: 'PAUSED', complete: 'COMPLETED', cancel: 'CANCELED', reopen: 'PENDING' };
  if (!from[action]?.includes(task.status)) throw new ConflictException('La acción no corresponde al estado actual');
  if (['pause', 'cancel', 'reopen'].includes(action) && !note?.trim()) throw new BadRequestException('Indica el motivo');
  if (['start', 'complete'].includes(action)) {
    if (!task.responsibleUserId) throw new ConflictException('Asigna un responsable antes de ejecutar la tarea');
    if (blocked) throw new ConflictException('Primero deben completarse todas las tareas predecesoras');
  }
  return to[action];
}
