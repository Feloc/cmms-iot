import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma.service';
import { tenantStorage } from '../src/common/tenant-context';
import { ManufacturingFatService } from '../src/modules/manufacturing/manufacturing-fat.service';
import { fatProtocolExample, previewFatProtocol } from '../src/modules/manufacturing/manufacturing-fat-import';

async function main() {
  const root = new PrismaService(); const rollback = new Error('ROLLBACK_FAT_IMPORT');
  try {
    await root.$transaction(async (tx: any) => {
      const db = new Proxy(tx, { get(target, key) { return key === '$transaction' ? (fn: any) => fn(tx) : target[key]; } });
      const tenant = await tx.tenant.create({ data: { slug: `fat-import-${randomUUID()}`, name: 'FAT import rollback' } });
      const other = await tx.tenant.create({ data: { slug: `fat-import-${randomUUID()}`, name: 'Other tenant' } });
      const admin = await tx.user.create({ data: { tenantId: tenant.id, email: 'admin@test.invalid', name: 'Test admin', role: 'ADMIN', password: 'not-a-login' } });
      const foreignAdmin = await tx.user.create({ data: { tenantId: other.id, email: 'admin@test.invalid', name: 'Other admin', role: 'ADMIN', password: 'not-a-login' } });
      const service = new ManufacturingFatService(db);
      await tenantStorage.run({ tenantId: tenant.id, userId: admin.id }, async () => {
        const imported = previewFatProtocol({ originalname: 'protocolo.xlsx', buffer: fatProtocolExample('xlsx') });
        const payload = { code: 'FAT-IMPORT', name: 'Protocolo importado', cases: imported.rows.map(r => r.data) };
        const first = await service.createTemplate(payload);
        assert.equal(first.cases.length, 3); assert.equal(first.version, 1);
        assert.equal(Number(first.cases[1].minimumValue), 210);
        assert.equal(first.cases[0].evidenceRequired, true);
        assert.equal(first.cases[0].instructions, 'Accionar el pulsador');
        const second = await service.createTemplate({ ...payload, name: 'Revisión posterior', cases: payload.cases.slice(0, 1) });
        assert.equal(second.version, 2);
        assert.equal(await tx.manufacturingFatTemplateCase.count({ where: { templateId: first.id } }), 3);
        assert.equal((await service.listTemplates('true')).length, 2);
        await tenantStorage.run({ tenantId: other.id, userId: foreignAdmin.id }, async () => {
          assert.equal((await service.listTemplates()).length, 0);
          const separate = await service.createTemplate(payload);
          assert.equal(separate.version, 1); assert.equal(separate.tenantId, other.id);
        });
      });
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await root.$disconnect(); }
  console.log('PASS: Excel → protocolo persistido, campos, versiones e aislamiento tenant; todos los datos revertidos');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
