import assert from 'node:assert/strict';
import test from 'node:test';
import { assertQuickReceipt, directInstallationQuantity, evaluateQuickInspection, validateQuickRecipe } from '../src/modules/manufacturing/manufacturing-quick.domain';

const recipe = () => ({ name: 'Buje', specification: 'PL-01', drawingRevision: 'A', critical: false, stableDesign: true, requiresSerial: false, inspectionMode: 'LOT', currency: 'COP', hourlyRate: 60000,
  materials: [{ inventoryItemId: 'bar', quantity: 0.5 }], operations: [{ name: 'Mecanizar', instructions: '', estimatedMinutes: 10, evidenceRequired: true }],
  checks: [{ name: 'Diámetro', criteria: '10 ± 0.1', type: 'NUMERIC', min: 9.9, max: 10.1, evidenceRequired: true }],
});
test('only stable, noncritical recipes with bounded and unique materials can be approved', () => {
  assert.equal(validateQuickRecipe(recipe()).materials[0].quantity, 0.5);
  for (const bad of [{ ...recipe(), critical: true }, { ...recipe(), stableDesign: false }, { ...recipe(), materials: [] }, { ...recipe(), materials: [...recipe().materials, ...recipe().materials] }, { ...recipe(), operations: [] }, { ...recipe(), hourlyRate: Infinity }]) assert.throws(() => validateQuickRecipe(bad));
});
test('inspection enforces evidence and derives numeric conformity rather than trusting client result', () => {
  const r = validateQuickRecipe(recipe());
  assert.equal(evaluateQuickInspection(r, [{ value: 10, result: 'PASS', evidence: 'MEAS-1' }]).passed, true);
  assert.equal(evaluateQuickInspection(r, [{ value: 11, result: 'PASS', evidence: 'MEAS-2' }]).passed, false);
  assert.throws(() => evaluateQuickInspection(r, [{ value: 10, result: 'PASS' }]));
  assert.throws(() => evaluateQuickInspection(r, []));
  assert.throws(() => evaluateQuickInspection(r, [{ value: null, result: 'PASS', evidence: 'E' }]));
});
test('only approved unreceived integer quantities can enter inventory', () => {
  assertQuickReceipt(2, 3, 1);
  for (const qty of [0, -1, 2.5, 3, NaN, Infinity]) assert.throws(() => assertQuickReceipt(qty, 3, 1));
  assert.throws(() => assertQuickReceipt(1, 3, 3));
});
test('direct delivery offsets installation once and handles mixed and reversed partial installation', () => {
  assert.equal(directInstallationQuantity(2, 3, 0), 2);
  assert.equal(directInstallationQuantity(2, 3, 2), 1);
  assert.equal(directInstallationQuantity(2, 3, 3), 0);
  assert.equal(directInstallationQuantity(2, 3, 1), 2);
});
