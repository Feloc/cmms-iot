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
test('hierarchical CSV, XLSX and XLS examples build the exact nested template payload', () => {
  for (const format of ['csv', 'xlsx', 'xls']) {
    const buffer = format === 'xls' ? XLSX.write(XLSX.read(fatProtocolExample('xlsx', 'hierarchical'), { type: 'buffer' }), { type: 'buffer', bookType: 'biff8' }) : fatProtocolExample(format, 'hierarchical');
    const preview = previewFatProtocol({ originalname: `fat.${format}`, buffer });
    assert.equal(preview.errorRows, 0); assert.equal(preview.rootCount, 3); assert.equal(preview.subpointCount, 2); assert.equal(preview.totalRows, 5);
    assert.equal(preview.cases.length, 3); assert.equal(preview.cases[1].subpoints?.length, 2);
    assert.equal(preview.cases[1].subpoints?.[0].maximumValue, 1);
    assert.equal(preview.cases[1].subpoints?.[0].evidenceRequired, true);
    assert.equal(preview.rows[3].parentPosition, 20); assert.equal(preview.rows[3].data.section, 'Eléctrica');
    assert.equal((preview.cases[1].subpoints?.[0] as any).position, undefined);
    assert.equal((preview.cases[1].subpoints?.[0] as any).parentPosition, undefined);
  }
});
test('hierarchical references can point forward, sort siblings and preserve source rows', () => {
  const preview = csv('posicion;punto_padre;nombre;criterio\n22;20;Segundo;OK\n\n20;;Principal;OK\n21;20;Primero;OK');
  assert.equal(preview.errorRows, 0); assert.equal(preview.rows[1].row, 4);
  assert.deepEqual(preview.cases[0].subpoints?.map(c => c.name), ['Primero', 'Segundo']);
  assert.equal(csv('nombre;criterio;punto_padre\nPlano;OK;').errorRows, 0);
  assert.equal(csv('position,parent_position,name,acceptanceCriteria\n1,,Parent,OK\n2,1,Child,OK').subpointCount, 1);
});
test('hierarchical errors reject orphan, self, cycle, deeper and ambiguous parents without partial payload', () => {
  const header = 'posicion;punto_padre;nombre;criterio\n';
  for (const body of ['1;99;Huérfano;OK', '1;1;Propio;OK', '1;2;A;OK\n2;1;B;OK', '1;;Raíz;OK\n2;1;Hijo;OK\n3;2;Nieto;OK', '1;;A;OK\n1;;B;OK\n2;1;Ambiguo;OK', '1;;Raíz;OK\n;1;Sin posición;OK', '1;;Raíz;OK\n2;1.5;Decimal;OK']) {
    const preview = csv(header + body);
    assert.ok(preview.errorRows > 0, body); assert.deepEqual(preview.cases, []);
  }
  assert.ok(csv(header + '1;;A;OK\n1;;B;OK\n2;1;Ambiguo;OK').rows[2].errors.some(e => e.includes('ambigua')));
});
test('subpoint limits and inherited section are validated before saving', () => {
  const rows = (count: number) => 'posicion;punto_padre;nombre;criterio\n1;;Principal;OK\n' + Array.from({ length: count }, (_, i) => `${i + 2};1;Hijo ${i};OK`).join('\n');
  assert.equal(csv(rows(50)).errorRows, 0); assert.equal(csv(rows(51)).cases.length, 0);
  const differentSection = csv('posicion;punto_padre;seccion;nombre;criterio\n1;;Eléctrica;Raíz;OK\n2;1;Mecánica;Hijo;OK');
  assert.ok(differentSection.rows[1].errors.some(e => e.includes('sección')));
  assert.ok(csv('posicion;punto_padre;nombre;criterio\n2147483647;;Raíz;OK\n1;2147483647;Hijo;OK').errorRows > 0);
});
test('formulas in parent references cannot become hierarchy links', () => {
  const book = XLSX.read(fatProtocolExample('xlsx', 'hierarchical'), { type: 'buffer' });
  book.Sheets[book.SheetNames[0]].L4 = { t: 'n', v: 20, f: '10+10' };
  const preview = previewFatProtocol({ originalname: 'fat.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) });
  assert.equal(preview.errorRows, 1); assert.deepEqual(preview.cases, []);
});
test('merged hierarchy cells and formula headers are rejected explicitly', () => {
  const book = XLSX.read(fatProtocolExample('xlsx', 'hierarchical'), { type: 'buffer' });
  const sheet = book.Sheets[book.SheetNames[0]];
  sheet['!merges'] = [{ s: { r: 3, c: 11 }, e: { r: 4, c: 11 } }];
  const preview = () => previewFatProtocol({ originalname: 'fat.xlsx', buffer: XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) });
  assert.throws(preview, /combinadas/);
  delete sheet['!merges']; sheet.L1 = { t: 's', v: 'punto_padre', f: '"punto_padre"' };
  assert.throws(preview, /encabezados/);
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
    assert.equal((await fetch(`${base}/import/example?format=xlsx&layout=hierarchical`)).status, 200);
    assert.equal((await fetch(`${base}/import/example?format=xlsx&layout=unknown`)).status, 400);
    const hierarchyResponse = await post('ADMIN', fatProtocolExample('xlsx', 'hierarchical'));
    const hierarchy = await hierarchyResponse.json() as any;
    assert.equal(hierarchy.errorRows, 0); assert.equal(writes, 1, 'Preview must not write templates');
    const savedHierarchy = await fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'FAT-H', name: 'Jerárquico', cases: hierarchy.cases }) });
    assert.equal(savedHierarchy.status, 201); assert.equal((await savedHierarchy.json() as any).cases[1].subpoints.length, 2); assert.equal(writes, 2);
  } finally { await app.close(); }
});
