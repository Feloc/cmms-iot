import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { tenantStorage } from '../../common/tenant-context';

// Reads remain available to viewers; observers never gain write access merely
// by belonging to an order. Services retain their action-specific permissions.
@Injectable()
export class ManufacturingAccessGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const { tenantId, userId } = tenantStorage.getStore() || {};
    if (!tenantId || !userId) throw new ForbiddenException('Contexto incompleto');
    const actor = await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { role: true } });
    if (!actor) throw new ForbiddenException('Usuario no encontrado');
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    if (actor.role === 'ADMIN') return true;
    if (actor.role !== 'TECH') throw new ForbiddenException('Tu rol solo permite consultar manufactura');

    const segments = String(request.route?.path || request.path).split('/').filter(Boolean);
    const resource = segments[segments.indexOf('manufacturing') + 1];
    const id = Object.values(request.params || {})[0];
    // Relation paths end at the manufacturing order and are queried with tenant.
    const resources: Record<string, [string, string]> = {
      orders: ['manufacturingOrder', ''], units: ['manufacturedUnit', 'manufacturingOrder'],
      documents: ['engineeringDocument', 'manufacturingOrder'],
      'document-revisions': ['engineeringDocumentRevision', 'document.manufacturingOrder'],
      boms: ['manufacturingBom', 'manufacturingOrder'],
      'bom-revisions': ['manufacturingBomRevision', 'bom.manufacturingOrder'],
      'assembly-operations': ['manufacturingAssemblyOperation', 'execution.manufacturingOrder'],
      'assembly-time-logs': ['manufacturingAssemblyTimeLog', 'operation.execution.manufacturingOrder'],
      'fat-executions': ['manufacturingFatExecution', 'manufacturingOrder'],
      'fat-cases': ['manufacturingFatCase', 'execution.manufacturingOrder'],
      'fat-deviations': ['manufacturingFatDeviation', 'execution.manufacturingOrder'],
      dispatches: ['manufacturingDispatch', 'manufacturingOrder'],
      'dispatch-checklist': ['manufacturingDispatchChecklistItem', 'dispatch.manufacturingOrder'],
      'dispatch-packages': ['manufacturingDispatchPackage', 'dispatch.manufacturingOrder'],
      'dispatch-documents': ['manufacturingDispatchDocument', 'dispatch.manufacturingOrder'],
      'site-deployments': ['manufacturingSiteDeployment', 'manufacturingOrder'],
      'site-receipt-checks': ['manufacturingSiteReceiptCheck', 'deployment.manufacturingOrder'],
      'sat-executions': ['manufacturingSatExecution', 'manufacturingOrder'],
      'sat-cases': ['manufacturingSatCase', 'execution.manufacturingOrder'],
      'sat-deviations': ['manufacturingSatDeviation', 'execution.manufacturingOrder'],
      handovers: ['manufacturingHandover', 'manufacturingOrder'],
      'handover-documents': ['manufacturingHandoverDocument', 'handover.manufacturingOrder'],
      'handover-trainings': ['manufacturingHandoverTraining', 'handover.manufacturingOrder'],
      'handover-spares': ['manufacturingHandoverSpare', 'handover.manufacturingOrder'],
    };
    const mapping = resources[resource];
    if (!mapping || typeof id !== 'string') throw new ForbiddenException('Esta acción requiere un administrador');
    const [model, path] = mapping;
    const access = { tenantId, OR: [{ responsibleUserId: userId }, { members: { some: { tenantId, userId, function: { not: 'OBSERVER' } } } }] };
    const relation = path ? path.split('.').reverse().reduce((where, key) => ({ [key]: where }), access as any) : access;
    const row = await (this.prisma as any)[model].findFirst({ where: { id, tenantId, ...relation }, select: { id: true } });
    if (!row) throw new NotFoundException('No tienes una función operativa en esta orden');
    return true;
  }
}
