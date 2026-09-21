import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import contracts from './manufacturing-contracts.json';

type Contract = { type?: string; date?: boolean; literal?: unknown; optional?: boolean; union?: Contract[]; array?: Contract; object?: Record<string, Contract> };

export function validateManufacturingBody(value: unknown, schema: Contract, path = 'body', depth = 0): void {
  const fail = (message: string): never => { throw new BadRequestException(`${path}: ${message}`); };
  if (depth > 12) fail('estructura demasiado profunda');
  if (value === undefined && schema.optional) return;
  if (schema.union) {
    for (const candidate of schema.union) {
      try { validateManufacturingBody(value, candidate, path, depth + 1); return; } catch (error) { if (!(error instanceof BadRequestException)) throw error; }
    }
    fail('tipo o valor inválido');
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'literal')) { if (value !== schema.literal) fail('valor no permitido'); return; }
  if (schema.object) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('se requiere un objeto');
    const body = value as Record<string, unknown>;
    for (const key of Object.keys(body)) if (!Object.prototype.hasOwnProperty.call(schema.object, key)) fail(`campo no permitido: ${key}`);
    for (const [key, property] of Object.entries(schema.object)) validateManufacturingBody(body[key], property, `${path}.${key}`, depth + 1);
    return;
  }
  if (schema.array) {
    if (!Array.isArray(value) || value.length > (path.endsWith('.lines') ? 5000 : 1000)) fail('lista inválida o demasiado extensa');
    (value as unknown[]).forEach((v, i) => validateManufacturingBody(v, schema.array!, `${path}[${i}]`, depth + 1));
    return;
  }
  if (schema.date) { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) fail('fecha inválida'); return; }
  if (typeof value !== schema.type) fail(`se requiere ${schema.type}`);
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 1e12)) fail('número fuera de rango');
  if (typeof value === 'string') {
    if (value.length > (/Signature$/.test(path) ? 300000 : 10000)) fail('texto demasiado extenso');
    if (/\.url$/.test(path) && value && !/^https?:\/\//i.test(value)) fail('el enlace debe usar http o https');
    if (/\.(lockVersion|version)$/.test(path)) fail('se requiere un entero positivo');
  }
  if (/\.(lockVersion|version)$/.test(path) && (!Number.isInteger(value) || Number(value) < 1)) fail('se requiere un entero positivo');
}

@Injectable()
export class ManufacturingValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (metadata.type !== 'body') return value;
    const name = metadata.metatype?.name || '';
    const schema = (contracts as Record<string, Contract>)[name];
    if (!schema) throw new BadRequestException(`Contrato de manufactura no definido: ${name}`);
    validateManufacturingBody(value ?? {}, schema);
    return value ?? {};
  }
}
