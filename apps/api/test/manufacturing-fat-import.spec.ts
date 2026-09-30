import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FAT_IMPORT_MAX_BYTES, fatProtocolExample, previewFatProtocol } from '../src/modules/manufacturing/manufacturing-fat-import';
import { ManufacturingFatController } from '../src/modules/manufacturing/manufacturing-fat.controller';
import { ManufacturingFatService } from '../src/modules/manufacturing/manufacturing-fat.service';
import { ManufacturingAccessGuard } from '../src/modules/manufacturing/manufacturing-access.guard';
import { ManufacturingValidationPipe } from '../src/modules/manufacturing/manufacturing-validation.pipe';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';

const csv = (text: string) => previewFatProtocol({ originalname: 'fat.csv', buffer: Buffer.from(text) });
test('downloadable CSV and XLSX examples round-trip with instructions and requirements', () => {
  for (const format of ['csv', 'xlsx']) {
    const preview = previewFatProtocol({ originalname: `fat.${format}`, buffer: fatProtocolExample(format) });
    assert.equal(preview.totalRows, 3); assert.equal(preview.errorRows, 0);
    assert.equal(preview.rows[1].data.minimumValue, 210);
    assert.equal(preview.rows[0].data.evidenceRequired, true);
    assert.equal(preview.rows[2].data.evidenceRequired, false);
    assert.equal(preview.rows[0].data.instructions, 'Accionar el pulsador');
  }
});
test('supports binary XLS and warns when only the first worksheet is imported', () => {
  const book = XLSX.read(fatProtocolExample('xlsx'), { type: 'buffer' });
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['ignored']]), 'Otra hoja');
  const preview = previewFatProtocol({ originalname: 'fat.xls', buffer: XLSX.write(book, { type: 'buffer', bookType: 'biff8' }) });
  assert.equal(preview.totalRows, 3); assert.equal(preview.errorRows, 0); assert.equal(preview.warnings.length, 1);
});
test('Spanish headers, decimal commas, UTF-8 and quoted multiline CSV remain intact', () => {
  const preview = csv('\ufeffNombre;Criterio de aceptación;Tipo;Mínimo;Máximo;Obligatorio;Evidencia\nPresión;"Sin fugas; estable\nen carga";numérico;-1,5;2,5;no;sí');
  assert.equal(preview.errorRows, 0); assert.equal(preview.rows[0].data.position, 1);
  assert.equal(preview.rows[0].data.minimumValue, -1.5); assert.equal(preview.rows[0].data.required, false);
  assert.equal(preview.rows[0].data.acceptanceCriteria, 'Sin fugas; estable\nen carga');
  assert.equal(csv('name,acceptanceCriteria\nSensor,Conforme').errorRows, 0);
});
test('reports row numbers and all semantic errors without returning a partial success', () => {
  const preview = csv('posicion;nombre;criterio;tipo;minimo;maximo;obligatorio\n1;;OK;NUMERIC;10;5;quizás\n1;Prueba;;invalid;;;sí');
  assert.equal(preview.errorRows, 2); assert.equal(preview.rows[0].row, 2);
  assert.ok(preview.rows[0].errors.some(e => e.includes('mínimo')));
  assert.ok(preview.rows[1].errors.some(e => e.includes('posición')));
});
test('rejects missing, duplicate or unknown headers and formula cells', () => {
  assert.throws(() => csv('nombre;otro\nPrueba;algo'), /Columna/);
  assert.throws(() => csv('nombre;name;criterio\nA;B;OK'), /duplicada/);
  assert.throws(() => csv('nombre\nPrueba'), /Faltan/);
  const book = XLSX.read(fatProtocolExample('xlsx'), { type: 'buffer' });
  book.Sheets[book.SheetNames[0]].G3 = { t: 'n', v: 210, f: '200+10' };
  assert.equal(previewFatProtocol({ originalname: 'fat.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) }).errorRows, 1);
});
test('rejects empty, malformed, oversized and excessive-row files without truncation', () => {
  assert.throws(() => previewFatProtocol());
  assert.throws(() => previewFatProtocol({ originalname: 'fat.xlsx', buffer: Buffer.from('x') }), /válido/);
  assert.throws(() => previewFatProtocol({ originalname: 'fat.pdf', buffer: Buffer.from('x') }), /Solo/);
  assert.throws(() => previewFatProtocol({ originalname: 'fat.csv', buffer: Buffer.alloc(FAT_IMPORT_MAX_BYTES + 1) }), /2 MB/);
  assert.throws(() => csv('nombre;criterio\n'), /No hay/);
  assert.throws(() => csv('nombre;criterio\n' + Array.from({ length: 501 }, () => 'Caso;OK').join('\n')), /500/);
  assert.equal(csv('nombre;criterio\n' + Array.from({ length: 500 }, () => 'Caso;OK').join('\n')).totalRows, 500);
});
test('multipart HTTP preview, examples, validation and ADMIN permissions', async () => {
  let writes = 0;
  class TestModule {}
  Module({ controllers: [ManufacturingFatController], providers: [
    { provide: PrismaService, useValue: { user: { findFirst: async () => ({ role: tenantStorage.getStore()?.userId }) } } },
    { provide: ManufacturingFatService, useValue: { createTemplate: async (body: unknown) => { writes++; return body; } } },
    ManufacturingAccessGuard, ManufacturingValidationPipe,
  ] })(TestModule);
  const app = await NestFactory.create(TestModule, { logger: false });
  app.use((req: any, _res: any, next: () => void) => tenantStorage.run({ tenantId: 'test', userId: req.headers['x-test-role'] || 'ADMIN' }, next));
  try {
    await app.listen(0, '127.0.0.1'); const base = `${await app.getUrl()}/manufacturing/fat-templates`;
    const post = (role: string, bytes = fatProtocolExample('xlsx')) => {
      const body = new FormData(); body.append('file', new Blob([new Uint8Array(bytes)]), 'fat.xlsx');
      return fetch(`${base}/import/preview`, { method: 'POST', body, headers: { 'x-test-role': role } });
    };
    for (const role of ['TECH', 'VIEWER']) assert.equal((await post(role)).status, 403);
    assert.equal((await fetch(`${base}/import/preview`, { method: 'POST' })).status, 400);
    assert.equal((await post('ADMIN', Buffer.alloc(FAT_IMPORT_MAX_BYTES + 1))).status, 413);
    const response = await post('ADMIN'); assert.equal(response.status, 201);
    const preview = await response.json() as any; assert.equal(preview.errorRows, 0); assert.equal(writes, 0);
    assert.equal((await fetch(`${base}/import/example?format=csv`)).status, 200);
    assert.equal((await fetch(`${base}/import/example?format=pdf`)).status, 400);
    const created = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'FAT', name: 'Importado', cases: preview.rows.map((r: any) => r.data) }) });
    assert.equal(created.status, 201); assert.equal(writes, 1);
  } finally { await app.close(); }
});
