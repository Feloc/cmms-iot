import { BadRequestException } from '@nestjs/common';
import { ManufacturingFatSubpointDefinitionDto } from './dto/manufacturing-fat.dto';

export function normalizeFatSubpoint(dto: ManufacturingFatSubpointDefinitionDto) {
  const text = (value: unknown) => String(value ?? '').trim() || null;
  const name = text(dto.name); const acceptanceCriteria = text(dto.acceptanceCriteria);
  if (!name || !acceptanceCriteria) throw new BadRequestException('El subpunto requiere nombre y criterio de aceptación');
  const resultType = dto.resultType || 'BOOLEAN';
  if (!['BOOLEAN', 'NUMERIC', 'TEXT'].includes(resultType)) throw new BadRequestException('Tipo de resultado de subpunto inválido');
  const number = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null;
    const result = Number(value);
    if (!Number.isFinite(result) || Math.abs(result) > 1e12) throw new BadRequestException('Límite numérico inválido');
    return result;
  };
  const minimumValue = number(dto.minimumValue); const maximumValue = number(dto.maximumValue);
  if (resultType === 'NUMERIC' && minimumValue === null && maximumValue === null) throw new BadRequestException('El subpunto numérico requiere un límite');
  if (minimumValue !== null && maximumValue !== null && minimumValue > maximumValue) throw new BadRequestException('Rango de subpunto inválido');
  return { name, acceptanceCriteria, instructions: text(dto.instructions), resultType, minimumValue, maximumValue, unit: text(dto.unit), required: dto.required !== false, evidenceRequired: dto.evidenceRequired === true };
}
