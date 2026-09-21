import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationPipe } from '@nestjs/common';
import { nextStatus, assertPermission } from '../src/modules/engineering/engineering.domain';
import { SaveProposalDto, CreateEngineeringRequestDto } from '../src/modules/engineering/engineering.dto';

const row = { status: 'REVIEW', proposalAuthorId: 'engineer', reviewerUserId: 'reviewer', responsibleUserId: 'engineer' };
test('reviewer approves while author and unrelated technicians cannot', () => {
  assert.equal(nextStatus(row, 'approve', { id: 'reviewer', role: 'TECH' }), 'APPROVED');
  assert.throws(() => nextStatus(row, 'approve', { id: 'engineer', role: 'ADMIN' }));
  assert.throws(() => nextStatus(row, 'approve', { id: 'other', role: 'TECH' }));
  assert.throws(() => nextStatus(row, 'approve', { id: 'reviewer', role: 'VIEWER' }));
});
test('workflow prevents skipped steps and preserves hold/resume state', () => {
  const admin = { id: 'admin', role: 'ADMIN' };
  assert.throws(() => nextStatus({ ...row, status: 'SUBMITTED' }, 'start', admin));
  assert.throws(() => nextStatus({ ...row, status: 'CLOSED' }, 'submit', admin));
  assert.equal(nextStatus({ ...row, status: 'ON_HOLD', previousStatus: 'EXECUTION' }, 'resume', admin), 'EXECUTION');
  assert.throws(() => nextStatus({ ...row, status: 'ON_HOLD', previousStatus: 'CLOSED' }, 'resume', admin));
  assert.throws(() => assertPermission('admin', row, { id: 'engineer', role: 'TECH' }));
});
test('DTO rejects missing proposals, invalid values, unknown fields and blank titles', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  const proposal = { solution: 'Solución', scope: 'Alcance', materials: 'Ninguno', estimatedCost: 0, currency: 'COP', downtimeHours: 0, acceptanceCriteria: 'Prueba', documentImpact: 'Manual' };
  for (const body of [{ version: 1 }, { version: 1, proposal: null }, { version: 1, proposal: { ...proposal, downtimeHours: -1 } }, { version: 1, proposal, status: 'APPROVED' }]) {
    await assert.rejects(pipe.transform(body, { type: 'body', metatype: SaveProposalDto }));
  }
  await assert.rejects(pipe.transform({ assetId: 'asset', title: '   ', problem: 'x', expectedBenefit: 'x', requestType: 'IMPROVEMENT', discipline: 'GENERAL', priority: 'MEDIUM' }, { type: 'body', metatype: CreateEngineeringRequestDto }));
  const result = await pipe.transform({ version: 1, proposal }, { type: 'body', metatype: SaveProposalDto });
  assert.equal(result.proposal.estimatedCost, 0);
});
