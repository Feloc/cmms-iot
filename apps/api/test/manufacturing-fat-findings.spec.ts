import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertFatFindingTransition, assertFatReady, isBlockingFatFinding } from '../src/modules/manufacturing/manufacturing-fat-findings.domain';
import { ManufacturingValidationPipe } from '../src/modules/manufacturing/manufacturing-validation.pipe';
import { CreateManufacturingFatDeviationDto, UpdateManufacturingFatDeviationDto } from '../src/modules/manufacturing/dto/manufacturing-fat.dto';

const point = () => ({ result: 'PASS', required: true, evidenceRequired: false, evidence: [], deviations: [] as Array<{ kind: string; status: string }> });
test('each unresolved nonconformity blocks, including pending verification', () => {
  for (const status of ['OPEN', 'IN_REWORK', 'PENDING_VERIFICATION']) {
    const c = point(); c.deviations = [{ kind: 'NON_CONFORMITY', status: 'RESOLVED' }, { kind: 'NON_CONFORMITY', status }];
    assert.throws(() => assertFatReady([c]), /no conformidades/);
    assert.equal(isBlockingFatFinding(c.deviations[1]), true);
  }
});
test('observations do not block but do not replace missing test results or evidence', () => {
  const c = point(); c.deviations = [{ kind: 'OBSERVATION', status: 'OPEN' }];
  assert.doesNotThrow(() => assertFatReady([c]));
  c.result = 'PENDING'; assert.throws(() => assertFatReady([c]), /todos los casos/);
  c.result = 'PASS'; c.evidenceRequired = true; assert.throws(() => assertFatReady([c]), /evidencia/);
});
test('a concession never masks another resolved finding that still needs a retest', () => {
  const c = point(); c.result = 'FAIL';
  c.deviations = [{ kind: 'NON_CONFORMITY', status: 'ACCEPTED_AS_IS' }, { kind: 'NON_CONFORMITY', status: 'RESOLVED' }];
  assert.throws(() => assertFatReady([c]), /concesión aislada/);
  c.deviations[1].status = 'ACCEPTED_AS_IS'; assert.doesNotThrow(() => assertFatReady([c]));
  c.deviations = [{ kind: 'OBSERVATION', status: 'ACCEPTED_AS_IS' }]; assert.throws(() => assertFatReady([c]));
});
test('correction, verification and reopening have explicit transitions', () => {
  assert.throws(() => assertFatFindingTransition('OPEN', 'RESOLVED'));
  assert.throws(() => assertFatFindingTransition('IN_REWORK', 'RESOLVED'));
  assert.doesNotThrow(() => assertFatFindingTransition('IN_REWORK', 'PENDING_VERIFICATION'));
  assert.doesNotThrow(() => assertFatFindingTransition('PENDING_VERIFICATION', 'IN_REWORK'));
  assert.doesNotThrow(() => assertFatFindingTransition('PENDING_VERIFICATION', 'RESOLVED'));
  assert.doesNotThrow(() => assertFatFindingTransition('RESOLVED', 'OPEN'));
});
test('finding DTOs validate classification, versions and prevent reclassification through updates', () => {
  const pipe = new ManufacturingValidationPipe();
  const create = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateManufacturingFatDeviationDto });
  const valid = { lockVersion: 1, title: 'Cable', description: 'Cable sin marca', kind: 'NON_CONFORMITY', severity: 'MAJOR' };
  assert.doesNotThrow(() => create(valid));
  assert.throws(() => create({ ...valid, kind: 'IGNORED' }));
  assert.throws(() => create({ ...valid, tenantId: 'other' }));
  assert.throws(() => create({ ...valid, lockVersion: 0 }));
  assert.throws(() => pipe.transform({ lockVersion: 1, status: 'RESOLVED', kind: 'OBSERVATION' }, { type: 'body', metatype: UpdateManufacturingFatDeviationDto }));
});
