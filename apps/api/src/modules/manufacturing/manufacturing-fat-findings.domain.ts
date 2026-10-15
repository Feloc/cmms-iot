import { ConflictException } from '@nestjs/common';

export const FAT_OPEN_FINDING_STATUSES = ['OPEN', 'IN_REWORK', 'PENDING_VERIFICATION'];
type Finding = { kind?: string; status: string };
export const isBlockingFatFinding = (finding: Finding) => finding.kind !== 'OBSERVATION' && FAT_OPEN_FINDING_STATUSES.includes(finding.status);

export function assertFatFindingTransition(current: string, target: string) {
  const transitions: Record<string, string[]> = {
    OPEN: ['IN_REWORK', 'ACCEPTED_AS_IS'],
    IN_REWORK: ['PENDING_VERIFICATION', 'ACCEPTED_AS_IS'],
    PENDING_VERIFICATION: ['RESOLVED', 'IN_REWORK', 'ACCEPTED_AS_IS'],
    RESOLVED: ['OPEN'], ACCEPTED_AS_IS: ['OPEN'],
  };
  if (current !== target && !transitions[current]?.includes(target)) throw new ConflictException(`Transición no permitida: ${current} → ${target}`);
}

export function assertFatReady(rows: Array<{ parentCaseId?: string | null; voidedAt?: unknown; result: string; required: boolean; evidenceRequired: boolean; evidence: unknown[]; deviations: Finding[] }>) {
  const cases = rows.filter(c => !c.voidedAt);
  if (cases.some(c => c.result === 'PENDING' && (!c.parentCaseId || c.required))) throw new ConflictException('Registra el resultado de todos los casos y subpuntos obligatorios');
  if (cases.some(c => c.required && c.result === 'NOT_APPLICABLE')) throw new ConflictException('Todos los casos obligatorios deben ejecutarse');
  if (cases.some(c => c.evidenceRequired && !c.evidence.length && (!c.parentCaseId || !['PENDING', 'NOT_APPLICABLE'].includes(c.result)))) throw new ConflictException('Falta evidencia en uno o más casos o subpuntos');
  if (rows.some(c => c.deviations.some(isBlockingFatFinding))) throw new ConflictException('Resuelve y verifica las no conformidades abiertas antes de enviar a aprobación');
  if (cases.some(c => {
    const findings = c.deviations.filter(d => d.kind !== 'OBSERVATION');
    return c.result === 'FAIL' && (!findings.length || findings.some(d => d.status !== 'ACCEPTED_AS_IS'));
  })) throw new ConflictException('Repite los casos no conformes; una concesión aislada no cubre las demás novedades');
}
