import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFatSubpoint } from '../src/modules/manufacturing/manufacturing-fat-subpoints.domain';
import { assertFatReady } from '../src/modules/manufacturing/manufacturing-fat-findings.domain';
import { ManufacturingValidationPipe } from '../src/modules/manufacturing/manufacturing-validation.pipe';
import { CreateManufacturingFatSubpointDto, CreateManufacturingFatTemplateDto, VoidManufacturingFatSubpointDto } from '../src/modules/manufacturing/dto/manufacturing-fat.dto';

const definition = { name: 'Continuidad', acceptanceCriteria: 'Menos de 1 ohm' };
const point = (patch: any = {}): any => ({ parentCaseId: 'parent', required: true, result: 'PASS', evidenceRequired: false, evidence: [], deviations: [], ...patch });

test('subpoint definitions validate ranges and preserve defaults', () => {
  const normalized = normalizeFatSubpoint(definition);
  assert.equal(normalized.required, true); assert.equal(normalized.resultType, 'BOOLEAN');
  assert.throws(() => normalizeFatSubpoint({ ...definition, name: ' ' }));
  assert.throws(() => normalizeFatSubpoint({ ...definition, resultType: 'NUMERIC' }), /límite/);
  assert.throws(() => normalizeFatSubpoint({ ...definition, minimumValue: 5, maximumValue: 1 }), /Rango/);
  assert.throws(() => normalizeFatSubpoint({ ...definition, minimumValue: 'NaN' }), /numérico/);
  assert.equal(normalizeFatSubpoint({ ...definition, resultType: 'NUMERIC', minimumValue: '0' }).minimumValue, 0);
});

test('required subpoints block; optional pending and voided rows do not fabricate work', () => {
  assert.throws(() => assertFatReady([point({ result: 'PENDING' })]), /subpuntos obligatorios/);
  assert.doesNotThrow(() => assertFatReady([point({ result: 'PENDING', required: false, evidenceRequired: true })]));
  assert.throws(() => assertFatReady([point({ result: 'NOT_APPLICABLE' })]), /obligatorios/);
  assert.doesNotThrow(() => assertFatReady([point({ result: 'PENDING', voidedAt: new Date() })]));
  assert.throws(() => assertFatReady([point({ parentCaseId: null, result: 'PENDING', required: false })]), /todos los casos/);
});

test('subpoint evidence, failures and independent findings remain blockers', () => {
  assert.throws(() => assertFatReady([point({ evidenceRequired: true })]), /evidencia/);
  assert.throws(() => assertFatReady([point({ result: 'FAIL', required: false })]), /Repite/);
  assert.doesNotThrow(() => assertFatReady([point({ result: 'FAIL', deviations: [{ status: 'ACCEPTED_AS_IS' }] })]));
  assert.throws(() => assertFatReady([point({ voidedAt: new Date(), deviations: [{ status: 'OPEN' }] })]), /no conformidades/);
});

test('subpoint contracts reject nested levels, mutable criteria updates and injected ownership', () => {
  const pipe = new ManufacturingValidationPipe();
  const validate = (body: any, metatype: any) => pipe.transform(body, { type: 'body', metatype });
  const create = { ...definition, lockVersion: 1, reason: 'Revisión detectada durante prueba' };
  assert.doesNotThrow(() => validate(create, CreateManufacturingFatSubpointDto));
  assert.throws(() => validate({ ...create, parentCaseId: 'another' }, CreateManufacturingFatSubpointDto));
  assert.throws(() => validate({ ...create, subpoints: [definition] }, CreateManufacturingFatSubpointDto));
  assert.throws(() => validate({ ...create, lockVersion: 0 }, CreateManufacturingFatSubpointDto));
  const template = { code: 'FAT', name: 'Protocolo', cases: [{ position: 1, ...definition, subpoints: [definition] }] };
  assert.doesNotThrow(() => validate(template, CreateManufacturingFatTemplateDto));
  assert.throws(() => validate({ ...template, cases: [{ ...template.cases[0], subpoints: [{ ...definition, subpoints: [definition] }] }] }, CreateManufacturingFatTemplateDto));
  assert.throws(() => validate({ lockVersion: 1, reason: 'Anulación', acceptanceCriteria: 'Otro criterio' }, VoidManufacturingFatSubpointDto));
});
