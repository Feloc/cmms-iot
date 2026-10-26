import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { tenantStorage } from '../src/common/tenant-context';
import { ToolsModule } from '../src/modules/tools/tools.module';

@Module({ imports: [ToolsModule, JwtModule.register({ global: true, secret: 'tools-isolated-integration-secret' })], providers: [PrismaService, { provide: APP_GUARD, useClass: JwtAuthGuard }] })
class TestApp {}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL es requerido');
  const originalUrl = process.env.DATABASE_URL;
  const admin = new PrismaClient({ datasourceUrl: originalUrl });
  const schemaName = `tools_test_${randomUUID().replace(/-/g, '')}`;
  const url = new URL(originalUrl); url.searchParams.set('schema', schemaName);
  const directory = await fs.mkdtemp(join(tmpdir(), 'tools-db-'));
  const schemaFile = join(directory, 'baseline.prisma');
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  let checks = 0;
  const cli = (args: string[], input?: string) => {
    const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], { input, encoding: 'utf8', timeout: 120000, env: { ...process.env, DATABASE_URL: url.toString() } });
    assert.equal(result.status, 0, (result.stdout || '') + (result.stderr || ''));
  };
  try {
    let baseline = await fs.readFile(resolve('prisma/schema.prisma'), 'utf8');
    for (const model of ['Tool', 'ToolLoan', 'ToolEvent', 'ToolPhoto']) baseline = baseline.replace(new RegExp(`^model ${model} \\{[\\s\\S]*?^\\}`, 'm'), '');
    baseline = baseline.replace(/^\s*tools\s+Tool\[\]\r?\n/m, '\n');
    await fs.writeFile(schemaFile, baseline);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    cli(['db', 'push', '--schema', schemaFile, '--skip-generate']);
    const migration = await fs.readFile(process.env.TOOLS_MIGRATION_FILE || resolve(__dirname, '../../../db/migrations/64_tools.sql'), 'utf8');
    cli(['db', 'execute', '--schema', schemaFile, '--stdin'], migration);
    cli(['db', 'execute', '--schema', schemaFile, '--stdin'], migration);
    console.log('PASS additive migration against previous schema, including repeat application');
    process.env.DATABASE_URL = url.toString();
    app = await NestFactory.create(TestApp, { logger: false });
    app.use((_req: any, _res: any, next: any) => tenantStorage.run({}, next));
    const db = app.get(PrismaService), jwt = app.get(JwtService);
    const tenant = await db.tenant.create({ data: { slug: 'tools-test', name: 'Tools test' } });
    const other = await db.tenant.create({ data: { slug: 'tools-other', name: 'Other' } });
    const users = await Promise.all(['admin', 'tech', 'viewer', 'external'].map((name, i) => db.user.create({ data: { tenantId: i === 3 ? other.id : tenant.id, name, email: `${name}@tools.invalid`, password: 'synthetic-unusable-password', role: i === 0 || i === 3 ? 'ADMIN' : i === 1 ? 'TECH' : 'VIEWER' } })));
    const tokens = users.map(u => jwt.sign({ sub: u.id, tenantId: u.tenantId, authVersion: u.authVersion }));
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    const request = async (who: number, route: string, method = 'GET', body?: any, expected = 200) => {
      const response = await fetch(base + '/tools' + route, { method, headers: { Authorization: `Bearer ${tokens[who]}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
      const text = response.headers.get('content-type')?.startsWith('image/') ? Buffer.from(await response.arrayBuffer()) : await response.text();
      assert.equal(response.status, expected, `${method} ${route}: ${String(text)}`); checks++;
      if (typeof text !== 'string') return text;
      try { return JSON.parse(text); } catch { return text; }
    };
    const input = { code: 'HER-1', name: 'Llave', tracking: 'QUANTITY', quantity: 10, location: 'Bodega', responsibleUserId: users[1].id };
    await request(1, '', 'POST', input, 403); await request(2, '', 'POST', input, 403);
    await request(0, '', 'POST', { ...input, tenantId: other.id }, 400);
    await request(0, '', 'POST', { ...input, tracking: 'UNIT' }, 400);
    await request(0, '', 'POST', { ...input, serialNumber: 'X' }, 400);
    await request(0, '', 'POST', { ...input, acquiredOn: '2026-02-30' }, 400);
    await request(0, '', 'POST', { ...input, responsibleUserId: users[3].id }, 400);
    let tool = await request(0, '', 'POST', input, 201);
    await request(0, '', 'POST', { ...input, code: ' her-1 ' }, 409);
    for (const path of [`/${tool.id}`, `/${tool.id}/events`, `/${tool.id}/photo`]) await request(3, path, 'GET', undefined, 404);
    assert.equal((await request(3, '')).total, 0);
    await request(3, `/${tool.id}/loans`, 'POST', { version: 1, quantity: 1, recipientUserId: users[3].id, destination: 'Otro' }, 404);
    await request(2, `/${tool.id}/loans`, 'POST', { version: 1, quantity: 1, recipientUserId: users[2].id, destination: 'A' }, 403);
    await request(0, `/${tool.id}/loans`, 'POST', { version: 1, quantity: 1, recipientUserId: users[3].id, destination: 'A' }, 400);
    await request(0, `/${tool.id}/loans`, 'POST', { version: 1, quantity: 11, recipientUserId: users[1].id, destination: 'A' }, 409);
    const lending = { version: tool.version, quantity: 6, recipientUserId: users[1].id, destination: 'Proyecto A', expectedReturnOn: '2099-10-25' };
    const race = await Promise.all([1, 2].map(() => fetch(base + `/tools/${tool.id}/loans`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[1]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(lending) })));
    assert.deepEqual(race.map(r => r.status).sort(), [201, 409]); checks++;
    tool = await request(0, `/${tool.id}`); assert.equal(tool.availableQty, 4); assert.equal(tool.loanedQty, 6); assert.equal(tool.loans.length, 1);
    const loan = tool.loans[0];
    await request(1, `/${tool.id}/loans/${loan.id}/return`, 'POST', { version: tool.version, quantity: 7, condition: 'GOOD' }, 409);
    await request(1, `/${tool.id}/loans/${loan.id}/return`, 'POST', { version: tool.version, quantity: 2, condition: 'DAMAGED' }, 400);
    tool = await request(1, `/${tool.id}/loans/${loan.id}/return`, 'POST', { version: tool.version, quantity: 2, condition: 'DAMAGED', note: 'Desgaste' }, 201);
    assert.equal(tool.damagedQty, 2); assert.equal(tool.loanedQty, 4); assert.equal(tool.availableQty, 4);
    tool = await request(1, `/${tool.id}/loans/${loan.id}/return`, 'POST', { version: tool.version, quantity: 4, condition: 'GOOD' }, 201);
    assert.equal(tool.loanedQty, 0); assert.equal(tool.availableQty, 8); assert.equal(tool.loans.length, 0); assert.equal(tool.closedLoans.length, 1);
    await request(1, `/${tool.id}/loans/${loan.id}/return`, 'POST', { version: tool.version, quantity: 1, condition: 'GOOD' }, 409);
    await request(1, `/${tool.id}/condition`, 'POST', { version: tool.version, quantity: 1, from: 'DAMAGED', to: 'GOOD', note: 'Reparada' }, 403);
    tool = await request(0, `/${tool.id}/condition`, 'POST', { version: tool.version, quantity: 1, from: 'DAMAGED', to: 'MAINTENANCE', note: 'A reparación' }, 201);
    tool = await request(0, `/${tool.id}/condition`, 'POST', { version: tool.version, quantity: 1, from: 'MAINTENANCE', to: 'GOOD', note: 'Reparación terminada' }, 201);
    tool = await request(0, `/${tool.id}/condition`, 'POST', { version: tool.version, quantity: 1, from: 'DAMAGED', to: 'RETIRED', note: 'Irreparable' }, 201);
    assert.equal(tool.retiredQty, 1); assert.equal(tool.availableQty, 9); assert.equal(tool.quantity, 10);
    tool = await request(0, `/${tool.id}/receipts`, 'POST', { version: tool.version, quantity: 5, note: 'Compra' }, 201);
    assert.equal(tool.quantity, 15); assert.equal(tool.availableQty, 14);
    await request(0, `/${tool.id}`, 'PATCH', { ...input, version: tool.version }, 400);
    const { tracking, quantity, ...fields } = input;
    const previousVersion = tool.version;
    tool = await request(0, `/${tool.id}`, 'PATCH', { ...fields, location: 'Taller', version: tool.version });
    await request(0, `/${tool.id}`, 'PATCH', { ...fields, version: previousVersion }, 409);
    console.log('PASS tenant boundaries, roles, concurrent lending, partial returns, condition balances and stale edits');

    const csv = 'codigo,nombre,control,cantidad,ubicacion,responsable_email,fecha_compra\nHER-2,Taladro,INDIVIDUAL,1,Taller,tech@tools.invalid,2026-10-25\nHER-3,Llave,CANTIDAD,3,Bodega,,\n';
    assert.equal((await request(0, '/import/preview', 'POST', { csv }, 201)).count, 2);
    assert.equal((await request(0, '')).total, 1);
    await request(1, '/import/commit', 'POST', { csv }, 403);
    await request(0, '/import/commit', 'POST', { csv: csv.replace('HER-3', 'HER-1') }, 409);
    assert.equal((await request(0, '')).total, 1);
    assert.equal((await request(0, '/import/commit', 'POST', { csv }, 201)).count, 2);
    await request(0, '/import/commit', 'POST', { csv }, 409);
    const list = await request(2, ''); assert.equal(list.total, 3); assert.equal(list.stats.quantity, 19); assert.equal(list.stats.retiredQty, 1); assert.equal(list.permissions.operate, false);
    assert.equal((await request(0, '?status=RETIRED')).total, 1);
    assert.equal((await request(0, '?q=taladro')).items[0].code, 'HER-2');
    const unit = (await request(0, '?q=HER-2')).items[0];
    await request(0, `/${unit.id}/receipts`, 'POST', { version: unit.version, quantity: 1, note: 'Compra' }, 400);
    const form = (data: Buffer, version: number) => { const body = new FormData(); body.append('version', String(version)); body.append('file', new Blob([data], { type: 'image/png' }), 'foto.png'); return body; };
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGioAAAAASUVORK5CYII=', 'base64');
    await request(2, `/${tool.id}/photo`, 'POST', form(png, tool.version), 403);
    await request(0, `/${tool.id}/photo`, 'POST', form(Buffer.from('<svg>invalid</svg>'), tool.version), 400);
    tool = await request(0, `/${tool.id}/photo`, 'POST', form(png, tool.version), 201);
    assert.deepEqual(await request(1, `/${tool.id}/photo`), png);
    await request(3, `/${tool.id}/photo`, 'GET', undefined, 404);
    assert.equal((await request(0, `/${tool.id}`)).photo.data, undefined);
    await assert.rejects(db.toolLoan.create({ data: { tenantId: other.id, toolId: tool.id, quantity: 1, recipientUserId: users[3].id, recipientName: 'External', destination: 'External', deliveredById: users[3].id, deliveredByName: 'External' } }));
    const events = await request(0, `/${tool.id}/events`); assert.equal(events.total, 10); assert.equal(events.items.some((e: any) => e.action === 'returned' && e.details.condition === 'DAMAGED'), true);
    // All recorded history remains reachable after the first page.
    for (let i = 0; i < 23; i++) await db.toolEvent.create({ data: { tenantId: tenant.id, toolId: tool.id, action: 'test', actorId: users[0].id, actorName: 'Test', details: {} } });
    assert.equal((await request(0, `/${tool.id}/events`)).items.length, 30);
    assert.equal((await request(0, `/${tool.id}/events?page=2`)).items.length, 3);
    console.log(`PASS CSV preview/atomic import, private photos, database tenant constraints and complete event pagination (${checks} HTTP checks)`);
  } finally {
    if (app) await app.close();
    process.env.DATABASE_URL = originalUrl;
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect(); await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
