import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { canView, permissions, assertNoCycle, transition, validateConfiguration } from '../src/modules/tasks/tasks.domain';
import { TaskInputDto, TaskUpdateDto, TaskActionDto } from '../src/modules/tasks/tasks.dto';
const actor = (id: string, role = 'TECH', tenantId = 'one') => ({ id, role, tenantId, name: id });
const task = { id: 'a', tenantId: 'one', visibility: 'PRIVATE', createdByUserId: 'owner', responsibleUserId: 'owner', participants: [] };
test('privacy never grants administrators an implicit override or crosses tenants', () => {
  assert.equal(canView(task, actor('owner')), true);
  assert.equal(canView(task, actor('admin', 'ADMIN')), false);
  assert.equal(canView({ ...task, visibility: 'PUBLIC' }, actor('other')), true);
  assert.equal(canView({ ...task, visibility: 'PUBLIC' }, actor('owner', 'ADMIN', 'two')), false);
  assert.equal(canView({ ...task, participants: [{ userId: 'other' }], responsibleUserId: 'other' }, actor('other')), false);
});
test('selective viewing is independent of contribution, execution and management', () => {
  const row = { ...task, visibility: 'SELECTIVE', responsibleUserId: 'worker', participants: [{ userId: 'observer', role: 'OBSERVER' }, { userId: 'collab', role: 'COLLABORATOR' }] };
  assert.equal(canView(row, actor('outsider', 'ADMIN')), false);
  assert.equal(canView(row, actor('observer')), true);
  assert.deepEqual(permissions(row, actor('observer')), { manage: false, execute: false, contribute: false });
  assert.deepEqual(permissions(row, actor('collab')), { manage: false, execute: false, contribute: true });
  assert.deepEqual(permissions(row, actor('worker')), { manage: false, execute: true, contribute: true });
  assert.deepEqual(permissions(row, actor('owner')), { manage: true, execute: true, contribute: true });
  assert.deepEqual(permissions(row, actor('worker', 'VIEWER')), { manage: false, execute: false, contribute: false });
});
test('dependencies reject self and transitive cycles while allowing convergent paths', () => {
  assert.throws(() => assertNoCycle('a', 'a', []));
  assert.throws(() => assertNoCycle('a', 'c', [{ taskId: 'c', predecessorId: 'b' }, { taskId: 'b', predecessorId: 'a' }]));
  assert.doesNotThrow(() => assertNoCycle('a', 'b', [{ taskId: 'b', predecessorId: 'd' }, { taskId: 'c', predecessorId: 'd' }]));
});
test('execution cannot skip pending dependencies or responsible assignment', () => {
  const row = { ...task, status: 'PENDING' };
  assert.throws(() => transition(row, 'complete', '', false));
  assert.throws(() => transition(row, 'start', '', true));
  assert.throws(() => transition({ ...row, responsibleUserId: null }, 'start', '', false));
  assert.equal(transition(row, 'start', '', false), 'IN_PROGRESS');
  assert.throws(() => transition({ ...row, status: 'IN_PROGRESS' }, 'pause', '   ', false));
  assert.equal(transition({ ...row, status: 'COMPLETED' }, 'reopen', 'Corregir', false), 'PENDING');
});
test('private sharing and invalid date ranges fail explicitly', () => {
  assert.throws(() => validateConfiguration({ visibility: 'PRIVATE', responsibleUserId: 'other', participants: [] }, 'owner'));
  assert.throws(() => validateConfiguration({ visibility: 'PRIVATE', participants: [{ userId: 'other' }] }, 'owner'));
  assert.throws(() => validateConfiguration({ visibility: 'PUBLIC', plannedStart: '2026-10-02', dueAt: '2026-10-01', participants: [] }, 'owner'));
});
test('HTTP DTOs reject mass assignment, malformed progress, missing fields and nulls', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const input = { title: 'Tarea', description: '', expectedResult: '', visibility: 'PRIVATE', priority: 'NORMAL', participants: [], tags: [] };
  for (const data of [{ ...input, title: '  ' }, { ...input, tenantId: 'two' }, { ...input, status: 'COMPLETED' }, { ...input, participants: null }, { ...input, participants: [{ userId: 'x', role: 'ADMIN' }] }, { ...input, visibility: null }]) await assert.rejects(pipe.transform(data, { type: 'body', metatype: TaskInputDto }));
  for (const data of [{ version: 1, kind: 'PROGRESS', note: 'Avance' }, { version: 1, kind: 'PROGRESS', note: 'Avance', progressPercent: 100 }, { version: 1, kind: 'PROGRESS', note: 'Avance', progressPercent: null }, { version: 1, kind: 'COMMENT', note: ' ', minutesSpent: -1 }]) await assert.rejects(pipe.transform(data, { type: 'body', metatype: TaskUpdateDto }));
  await assert.rejects(pipe.transform({ version: 0, action: 'start' }, { type: 'body', metatype: TaskActionDto }));
  assert.equal((await pipe.transform(input, { type: 'body', metatype: TaskInputDto })).title, 'Tarea');
});
