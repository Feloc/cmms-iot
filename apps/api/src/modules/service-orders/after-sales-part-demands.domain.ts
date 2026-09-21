import { ConflictException } from '@nestjs/common';

export function demandProgress(requested: number, fulfilled: number, installed: number) {
  if (![requested, fulfilled, installed].every(Number.isFinite) || requested <= 0 || installed < 0 || fulfilled < installed || fulfilled > requested) {
    throw new ConflictException('Las cantidades deben cumplir: instalado ≤ recibido ≤ solicitado');
  }
  return installed >= requested ? 'FULFILLED' : fulfilled >= requested ? 'READY' : fulfilled > 0 ? 'PARTIALLY_FULFILLED' : 'SOURCING';
}

export function assertDemandTransition(current: string, target: string, requested: number, fulfilled: number, installed: number) {
  const progress = demandProgress(requested, fulfilled, installed);
  if (current === 'CANCELED' || current === 'FULFILLED') throw new ConflictException('La demanda está cerrada');
  if (target === 'CANCELED' && (fulfilled > 0 || installed > 0)) throw new ConflictException('No se puede cancelar una demanda con piezas recibidas o instaladas');
  if (['READY', 'PARTIALLY_FULFILLED', 'FULFILLED'].includes(target) && target !== progress) throw new ConflictException('El estado solicitado no corresponde a las cantidades recibidas e instaladas');
  if (['VALIDATED', 'SOURCING', 'IN_PRODUCTION', 'QUALITY_PENDING'].includes(target) && fulfilled > 0) throw new ConflictException('La demanda ya tiene piezas recibidas');
  const transitions: Record<string, string[]> = {
    VALIDATED: ['VALIDATED', 'SOURCING', 'ON_HOLD', 'CANCELED'],
    SOURCING: ['SOURCING', 'IN_PRODUCTION', 'QUALITY_PENDING', 'READY', 'PARTIALLY_FULFILLED', 'ON_HOLD', 'CANCELED'],
    IN_PRODUCTION: ['IN_PRODUCTION', 'QUALITY_PENDING', 'ON_HOLD', 'CANCELED'],
    QUALITY_PENDING: ['QUALITY_PENDING', 'IN_PRODUCTION', 'READY', 'PARTIALLY_FULFILLED', 'ON_HOLD', 'CANCELED'],
    READY: ['READY', 'FULFILLED', 'ON_HOLD'],
    PARTIALLY_FULFILLED: ['PARTIALLY_FULFILLED', 'READY', 'FULFILLED', 'ON_HOLD'],
    ON_HOLD: ['ON_HOLD', 'VALIDATED', 'SOURCING', 'IN_PRODUCTION', 'QUALITY_PENDING', 'READY', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELED'],
  };
  if (!transitions[current]?.includes(target)) throw new ConflictException(`Transición no permitida: ${current} → ${target}`);
}
