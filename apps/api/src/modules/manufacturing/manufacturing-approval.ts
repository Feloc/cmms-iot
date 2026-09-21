import { ConflictException } from '@nestjs/common';

export function assertIndependentApproval(actorId: string, participantIds: Array<string | null | undefined>, exceptionReason?: string | null) {
  if (!participantIds.includes(actorId)) return;
  if (typeof exceptionReason !== 'string' || exceptionReason.trim().length < 20 || exceptionReason.length > 2000) {
    throw new ConflictException('La aprobación requiere otro responsable. Si no está disponible, registra una excepción justificada de al menos 20 caracteres.');
  }
}
