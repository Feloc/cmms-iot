import { ConflictException, ForbiddenException } from '@nestjs/common';

export const transitions: Record<string, { from: string[]; to: string; permission: 'requester' | 'admin' | 'engineer' | 'reviewer' | 'validator' }> = {
  submit: { from: ['DRAFT','NEEDS_INFO'], to: 'SUBMITTED', permission: 'requester' },
  'authorize-study': { from: ['SUBMITTED'], to: 'STUDY', permission: 'admin' },
  'request-info': { from: ['SUBMITTED'], to: 'NEEDS_INFO', permission: 'admin' },
  'submit-review': { from: ['STUDY'], to: 'REVIEW', permission: 'engineer' },
  approve: { from: ['REVIEW'], to: 'APPROVED', permission: 'reviewer' },
  revise: { from: ['REVIEW'], to: 'STUDY', permission: 'reviewer' },
  reject: { from: ['SUBMITTED','REVIEW'], to: 'REJECTED', permission: 'admin' },
  start: { from: ['APPROVED'], to: 'EXECUTION', permission: 'engineer' },
  validate: { from: ['EXECUTION'], to: 'VALIDATION', permission: 'engineer' },
  close: { from: ['VALIDATION'], to: 'CLOSED', permission: 'validator' },
  rework: { from: ['VALIDATION'], to: 'EXECUTION', permission: 'validator' },
  hold: { from: ['SUBMITTED','STUDY','REVIEW','APPROVED','EXECUTION','VALIDATION'], to: 'ON_HOLD', permission: 'admin' },
  resume: { from: ['ON_HOLD'], to: '', permission: 'admin' },
  cancel: { from: ['DRAFT','SUBMITTED','NEEDS_INFO','STUDY','REVIEW','APPROVED','EXECUTION','VALIDATION','ON_HOLD'], to: 'CANCELED', permission: 'admin' },
};
export function assertPermission(permission: string, row: any, actor: { id: string; role: string }) {
  if (!['ADMIN','TECH'].includes(actor.role)) throw new ForbiddenException('Solo lectura');
  const owner: Record<string, string | undefined> = {
    requester: row.requestedByUserId, engineer: row.responsibleUserId,
    reviewer: row.reviewerUserId, validator: row.validatorUserId,
  };
  if (actor.role !== 'ADMIN' && owner[permission] !== actor.id) throw new ForbiddenException('No tienes permiso para esta acción');
}
export function nextStatus(row: any, action: string, actor: { id: string; role: string }) {
  const transition = transitions[action];
  if (!transition || !transition.from.includes(row.status)) throw new ConflictException('La acción no corresponde al estado actual');
  assertPermission(transition.permission, row, actor);
  if (action === 'approve' && actor.id === row.proposalAuthorId) throw new ForbiddenException('La propuesta debe ser aprobada por otra persona');
  if (action === 'resume' && !transitions.hold.from.includes(row.previousStatus)) throw new ConflictException('No existe un estado anterior válido');
  return action === 'resume' ? row.previousStatus : transition.to;
}
