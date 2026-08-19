import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bomHierarchyLevels,
  formatManufacturingOrderNumber,
  isAllowedEngineeringFilename,
  normalizeEngineeringCode,
  resumableManufacturingStatus,
} from '../src/modules/manufacturing/manufacturing.domain';

test('formats manufacturing numbers with tenant-year sequence padding', () => {
  assert.equal(formatManufacturingOrderNumber(2026, 1), 'OF-2026-00001');
  assert.equal(formatManufacturingOrderNumber(2026, 123456), 'OF-2026-123456');
});

test('calculates BOM hierarchy levels and rejects invalid parent references', () => {
  const levels = bomHierarchyLevels([
    { position: 10, parentPosition: null },
    { position: 20, parentPosition: 10 },
    { position: 30, parentPosition: 20 },
  ]);
  assert.deepEqual([...levels.entries()], [[10, 0], [20, 1], [30, 2]]);
  assert.throws(() => bomHierarchyLevels([{ position: 10 }, { position: 10 }]));
  assert.throws(() => bomHierarchyLevels([{ position: 20, parentPosition: 10 }]));
  assert.throws(() => bomHierarchyLevels([{ position: 10, parentPosition: 20 }]));
});

test('rejects invalid manufacturing number components', () => {
  assert.throws(() => formatManufacturingOrderNumber(1999, 1));
  assert.throws(() => formatManufacturingOrderNumber(2026, 0));
  assert.throws(() => formatManufacturingOrderNumber(2026.5, 1));
});

test('only resumes to non-terminal foundation states', () => {
  assert.equal(resumableManufacturingStatus('ENGINEERING'), 'ENGINEERING');
  assert.equal(resumableManufacturingStatus('RELEASED'), 'RELEASED');
  assert.equal(resumableManufacturingStatus('ON_HOLD'), 'DRAFT');
  assert.equal(resumableManufacturingStatus('CANCELED'), 'DRAFT');
  assert.equal(resumableManufacturingStatus(null), 'DRAFT');
});

test('normalizes engineering document and revision codes', () => {
  assert.equal(normalizeEngineeringCode(' mec 001 '), 'MEC-001');
  assert.equal(normalizeEngineeringCode('rev   b'), 'REV-B');
  assert.equal(normalizeEngineeringCode(null), '');
});

test('allows controlled engineering formats and rejects unsafe extensions', () => {
  assert.equal(isAllowedEngineeringFilename('Plano General.PDF'), true);
  assert.equal(isAllowedEngineeringFilename('programa.zap18'), true);
  assert.equal(isAllowedEngineeringFilename('modelo.step'), true);
  assert.equal(isAllowedEngineeringFilename('instalador.exe'), false);
  assert.equal(isAllowedEngineeringFilename('archivo_sin_extension'), false);
});
