import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { dateOnly, loanedQty, parseToolCsv, stockChange, validateTool } from '../src/modules/tools/tools.domain';
import { CreateToolDto, EditToolDto, LendToolDto, ReturnToolDto, ToolConditionDto, ToolListDto } from '../src/modules/tools/tools.dto';

test('stock changes conserve quantities and never reactivate retired or loaned units', () => {
  const tool = { tracking: 'QUANTITY', quantity: 10, availableQty: 4, maintenanceQty: 1, damagedQty: 2, retiredQty: 1 };
  assert.equal(loanedQty(tool), 2);
  const next = { ...tool, ...stockChange(tool, 'DAMAGED', 'MAINTENANCE', 2) };
  assert.equal(loanedQty(next), 2); assert.equal(next.maintenanceQty, 3); assert.equal(next.damagedQty, 0);
  for (const [from, to, qty] of [['GOOD', 'DAMAGED', 5], ['RETIRED', 'GOOD', 1], ['GOOD', 'GOOD', 1], ['GOOD', 'DAMAGED', 0], ['GOOD', 'DAMAGED', 0.5]] as const) assert.throws(() => stockChange(tool, from, to, qty));
  assert.throws(() => validateTool('UNIT', 2)); assert.throws(() => validateTool('QUANTITY', 5, 'SERIAL'));
});
test('calendar dates do not roll over or shift timezones', () => {
  assert.equal(dateOnly('2024-02-29')?.toISOString(), '2024-02-29T00:00:00.000Z');
  for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-10-25T00:00:00Z', '25/10/2026']) assert.throws(() => dateOnly(value));
});
test('CSV preserves quoted delimiters and multiline notes while rejecting corrupt input', () => {
  const csv = '\uFEFFcodigo,nombre,control,cantidad,ubicacion,observaciones\r\nHER-1,"Llave, 13 mm",CANTIDAD,5,Taller,"Primera línea\nSegunda ""línea"""\r\n';
  const rows = parseToolCsv(csv);
  assert.equal(rows[0].nombre, 'Llave, 13 mm'); assert.equal(rows[0].observaciones, 'Primera línea\nSegunda "línea"');
  assert.equal(parseToolCsv('codigo;nombre;control;cantidad;ubicacion\nA;Llave;CANTIDAD;2;Taller')[0].cantidad, '2');
  for (const value of ['codigo,nombre\nA,B', 'codigo,nombre,control,cantidad,ubicacion\nA,B,UNIT,1', 'codigo,nombre,control,cantidad,ubicacion\nA,"B,UNIT,1,Taller', 'codigo,nombre,control,cantidad,ubicacion\nA,"B"x,UNIT,1,Taller', 'codigo,nombre,control,cantidad,ubicacion\n', 'codigo,nombre,control,cantidad,ubicacion,nombre\nA,B,UNIT,1,Taller,B']) assert.throws(() => parseToolCsv(value));
  assert.throws(() => parseToolCsv('codigo,nombre,control,cantidad,ubicacion\n' + 'A,B,UNIT,1,Taller\n'.repeat(201)));
});
test('HTTP validation rejects unauthorized fields, null transitions, invalid amounts and query values', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const validate = (body: any, metatype: any) => pipe.transform(body, { type: 'body', metatype });
  const body = { code: ' HER-1 ', name: ' Taladro ', location: ' Taller ', tracking: 'UNIT', quantity: 1 };
  const dto = await validate(body, CreateToolDto); assert.equal(dto.code, 'HER-1'); assert.equal(dto.location, 'Taller');
  for (const input of [{ ...body, tenantId: 'other' }, { ...body, availableQty: 999 }, { ...body, name: '   ' }, { ...body, quantity: 1.5 }, { ...body, quantity: 0 }, { ...body, initialCondition: null }, { ...body, tracking: 'UNKNOWN' }]) await assert.rejects(validate(input, CreateToolDto));
  await assert.rejects(validate({ code: 'A', name: 'A', location: 'A', version: 1, quantity: 99 }, EditToolDto));
  await assert.rejects(validate({ version: 1, recipientUserId: 'u', quantity: -1, destination: 'A' }, LendToolDto));
  await assert.rejects(validate({ version: 1, quantity: 1, condition: null }, ReturnToolDto));
  await assert.rejects(validate({ version: 1, quantity: 1, from: 'RETIRED', to: 'GOOD', note: 'Motivo' }, ToolConditionDto));
  await assert.rejects(validate({ version: 1, quantity: 1, from: 'GOOD', to: 'DAMAGED', note: '  ' }, ToolConditionDto));
  await assert.rejects(validate({ page: '0' }, ToolListDto));
});
