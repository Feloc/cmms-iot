import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { Module } from '@nestjs/common';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma.service';
import { TasksModule } from '../src/modules/tasks/tasks.module';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { tenantStorage } from '../src/common/tenant-context';

@Module({ imports: [TasksModule, JwtModule.register({ global: true, secret: 'tasks-isolated-test-secret' })], providers: [PrismaService, { provide: APP_GUARD, useClass: JwtAuthGuard }] })
class TestApp {}
async function main() {
  if (process.env.TASKS_TEST_DATABASE !== 'isolated') throw new Error('Run against an isolated database with TASKS_TEST_DATABASE=isolated');
  const app = await NestFactory.create(TestApp, { logger: false });
  app.use((_req: any, _res: any, next: any) => tenantStorage.run({}, next));
  const db: any = app.get(PrismaService);
  const jwt = app.get(JwtService);
  const tenantId = 'tasks-test-' + randomUUID(), otherId = tenantId + '-other';
  let checks = 0;
  try {
    await db.tenant.createMany({ data: [{ id: tenantId, slug: tenantId, name: 'Tasks test' }, { id: otherId, slug: otherId, name: 'Other test' }] });
    const users = await Promise.all(['owner', 'worker', 'observer', 'collab', 'admin', 'viewer', 'other'].map((name, i) => db.user.create({ data: { tenantId: i === 6 ? otherId : tenantId, name, email: `${name}@tasks.test`, password: 'not-a-password', role: i === 4 ? 'ADMIN' : i === 5 ? 'VIEWER' : 'TECH' } })));
    const tokens = users.map(u => jwt.sign({ sub: u.id, tenantId: u.tenantId, authVersion: u.authVersion }));
    await app.listen(0, '127.0.0.1'); const base = await app.getUrl();
    const request = async (who: number, route: string, method = 'GET', body?: any, expected = 200) => {
      const response = await fetch(base + '/tasks' + route, { method, headers: { Authorization: `Bearer ${tokens[who]}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, ...(body !== undefined ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
      const text = await response.text(); assert.equal(response.status, expected, `${method} ${route}: ${text}`); checks++;
      try { return JSON.parse(text); } catch { return text; }
    };
    const input = { title: 'Preparar sensor', description: 'Prueba', expectedResult: 'Sensor disponible', visibility: 'PRIVATE', priority: 'NORMAL', participants: [], tags: [], responsibleUserId: users[0].id };
    const create = (data: any = {}) => request(0, '', 'POST', { ...input, ...data }, 201);
    const action = (row: any, verb: string, who = 0, expected = 201) => request(who, `/${row.id}/actions`, 'POST', { version: row.version, action: verb, note: 'Motivo de prueba' }, expected);
    const asset = await db.asset.create({ data: { tenantId, code: 'TASK-TEST', name: 'Sensor de prueba' } });
    const otherAsset = await db.asset.create({ data: { tenantId: otherId, code: 'OTHER-TASK-TEST', name: 'Sensor privado de otra empresa' } });
    const references = await request(0, '/references?type=asset&q=TASK-TEST');
    assert.equal(references.length, 1); assert.equal(references[0].id, asset.id);
    await request(0, '', 'POST', { ...input, assetId: otherAsset.id }, 400);
    const linked = await create({ assetId: asset.id, title: 'Tarea vinculada' });
    assert.equal(linked.related[0].href, '/assets/' + asset.id);
    let privateTask = await create();
    for (const who of [1, 4, 6]) { await request(who, '/' + privateTask.id, 'GET', undefined, 404); const list = await request(who, '?scope=all'); assert.equal(list.total, 0); assert.equal(list.stats.pending, 0); }
    await request(5, '', 'POST', input, 403);
    await request(0, '', 'POST', { ...input, tenantId: otherId }, 400);
    await request(0, '', 'POST', { ...input, responsibleUserId: users[1].id }, 400);
    await request(0, '', 'POST', { ...input, visibility: 'SELECTIVE', participants: [{ userId: users[6].id, role: 'OBSERVER' }] }, 400);
    await request(0, '', 'POST', { ...input, visibility: 'PUBLIC', responsibleUserId: users[5].id }, 400);
    let shared = await create({ title: 'Instalar sensor', visibility: 'SELECTIVE', responsibleUserId: users[1].id, participants: [{ userId: users[2].id, role: 'OBSERVER' }, { userId: users[3].id, role: 'COLLABORATOR' }] });
    for (const who of [1, 2, 3]) await request(who, '/' + shared.id);
    await request(4, '/' + shared.id, 'GET', undefined, 404);
    await action(shared, 'start', 2, 403);
    await action(shared, 'start', 3, 403);
    shared = await request(0, `/${shared.id}/dependencies`, 'POST', { version: shared.version, predecessorId: privateTask.id }, 201);
    const restricted = await request(1, '/' + shared.id);
    assert.equal(restricted.dependencies[0].restricted, true); assert.equal(restricted.dependencies[0].title, undefined); assert.equal(restricted.dependencies[0].predecessorId, undefined);
    assert.equal(JSON.stringify(restricted).includes(privateTask.id), false);
    await action(shared, 'start', 1, 409);
    privateTask = await action(privateTask, 'start'); privateTask = await action(privateTask, 'complete');
    shared = await action(shared, 'start', 1);
    await action(privateTask, 'reopen', 0, 409);
    shared = await request(3, `/${shared.id}/updates`, 'POST', { version: shared.version, kind: 'PROGRESS', note: 'Soporte instalado', progressPercent: 60, minutesSpent: 30 }, 201);
    const prior = shared.version;
    shared = await request(1, `/${shared.id}/updates`, 'POST', { version: shared.version, kind: 'COMMENT', note: 'Revisar cableado' }, 201);
    assert.equal(shared.progressPercent, 60);
    await request(1, `/${shared.id}/updates`, 'POST', { version: prior, kind: 'COMMENT', note: 'Versión antigua' }, 409);
    shared = await request(1, `/${shared.id}/updates`, 'POST', { version: shared.version, kind: 'PROGRESS', note: 'Corrección: falta soporte', progressPercent: 40 }, 201);
    assert.equal(shared.updates.length, 3); assert.equal(shared.progressPercent, 40);
    const form = new FormData(); form.append('version', String(shared.version)); form.append('updateId', shared.updates[0].id); form.append('file', new Blob(['evidence-content']), 'evidencia.txt');
    shared = await request(1, `/${shared.id}/attachments`, 'POST', form, 201);
    const fileRoute = `/${shared.id}/attachments/${shared.attachments[0].id}/download`;
    assert.equal(await request(2, fileRoute), 'evidence-content');
    await request(4, fileRoute, 'GET', undefined, 404); await request(6, fileRoute, 'GET', undefined, 404);
    assert.equal(shared.attachments[0].storageKey, undefined);
    shared = await request(0, '/' + shared.id, 'PATCH', { ...input, title: shared.title, visibility: 'SELECTIVE', responsibleUserId: users[1].id, participants: [{ userId: users[3].id, role: 'COLLABORATOR' }], version: shared.version });
    await request(2, fileRoute, 'GET', undefined, 404); // revoked access applies to downloads immediately
    shared = await action(shared, 'complete', 1); assert.equal(shared.progressPercent, 100);
    shared = await action(shared, 'archive'); await request(1, `/${shared.id}/updates`, 'POST', { version: shared.version, kind: 'COMMENT', note: 'Archivada' }, 409);
    const archived = await request(1, '?archived=true'); assert.equal(archived.items[0].id, shared.id);
    shared = await action(shared, 'restore'); shared = await action(shared, 'reopen'); assert.equal(shared.progressPercent, 0); assert.equal(shared.updates.length, 3);
    let publicTask = await create({ visibility: 'PUBLIC' }); await request(4, '/' + publicTask.id); await action(publicTask, 'start', 4, 403); await request(6, '/' + publicTask.id, 'GET', undefined, 404);
    // Concurrent edits to the same task: exactly one stale version must fail.
    const updates = await Promise.all([1, 2].map(n => fetch(base + `/tasks/${publicTask.id}/updates`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: publicTask.version, kind: 'COMMENT', note: `Concurrent ${n}` }) })));
    assert.deepEqual(updates.map(r => r.status).sort(), [201, 409]); checks++;
    // Concurrent graph edits on DIFFERENT tasks cannot produce a cycle.
    const a = await create(), b = await create();
    const cycles = await Promise.all([[a, b], [b, a]].map(([row, pre]) => fetch(base + `/tasks/${row.id}/dependencies`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: row.version, predecessorId: pre.id }) })));
    assert.deepEqual(cycles.map(r => r.status).sort(), [201, 409]); checks++;
    // A predecessor reopening and a successor starting must never both succeed.
    let pre = await create(); pre = await action(pre, 'start'); pre = await action(pre, 'complete');
    let next = await create(); next = await request(0, `/${next.id}/dependencies`, 'POST', { version: next.version, predecessorId: pre.id }, 201);
    const race = await Promise.all([[pre, 'reopen'], [next, 'start']].map(([row, verb]: any) => fetch(base + `/tasks/${row.id}/actions`, { method: 'POST', headers: { Authorization: `Bearer ${tokens[0]}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: row.version, action: verb, note: 'Race' }) })));
    assert.deepEqual(race.map(r => r.status).sort(), [201, 409]); checks++;
    const unauthorized = await fetch(base + '/tasks'); assert.equal(unauthorized.status, 401); checks++;
    console.log(`Tasks integration passed: ${checks} HTTP and concurrency checks.`);
  } finally {
    const where = { tenantId: { in: [tenantId, otherId] } };
    const files = await db.taskAttachment.findMany({ where });
    for (const file of files) await rm(path.join(process.env.ATTACHMENTS_DIR!, 'tasks', file.storageKey), { force: true });
    for (const model of ['taskAttachment', 'taskEvent', 'taskUpdate', 'taskDependency', 'taskParticipant', 'task', 'asset', 'user']) await db[model].deleteMany({ where });
    await db.tenant.deleteMany({ where: { id: { in: [tenantId, otherId] } } });
    await app.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
