import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente mínimo para integrar con OasisCom por API Externo.
 *
 * Docs:
 * - Token: https://identity.oasiscom.com/connect/token?context={conexión}
 * - External services: POST https://app.oasiscom.com/api/externalservices/{conexión}/{código_empresa}/{código_publicación}
 *
 * Nota: La estructura del JSON/XML que se envía en FileBase64 depende de la "publicación" (BINT) configurada en OasisCom.
 * Este cliente manda un JSON "sugerido" que suele ser fácil de mapear en una publicación a medida.
 */
@Injectable()
export class OasiscomClient {
  private readonly logger = new Logger(OasiscomClient.name);

  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  private get env() {
    return {
      enabled: process.env.OASISCOM_ENABLED === 'true',
      context: process.env.OASISCOM_CONTEXT || '',
      companyCode: process.env.OASISCOM_COMPANY_CODE || '',
      publicationMordCreate: process.env.OASISCOM_PUBLICATION_MORD_CREATE || '',
      username: process.env.OASISCOM_USERNAME || '',
      password: process.env.OASISCOM_PASSWORD || '',
      // Defaults del mapeo hacia MORD:
      mordDocumentId: process.env.OASISCOM_MORD_DOCUMENT_ID || 'OT',
      mordLocationId: process.env.OASISCOM_MORD_LOCATION_ID || '1',
      // Si tu publicación requiere que equipmentId sea el ID de MEQU, define cuál campo del Asset usar:
      //   code | serialNumber | model
      equipmentIdSource: (process.env.OASISCOM_MORD_EQUIPMENT_ID_SOURCE || 'code') as
        | 'code'
        | 'serialNumber'
        | 'model',
    };
  }

  /**
   * Obtiene token de OasisCom con cache en memoria (por contexto+usuario).
   * Ref: docs de generación de token.
   */
  async getToken(context: string, username: string, password: string): Promise<string> {
    const cacheKey = `${context}::${username}`;
    const cached = this.tokenCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now + 30_000) return cached.token; // 30s de margen

    const url = `https://identity.oasiscom.com/connect/token?context=${encodeURIComponent(context)}`;
    const form = new URLSearchParams();
    form.set('UserName', username);
    form.set('Password', password);
    // Estos parámetros aparecen en la documentación pública de OasisCom
    form.set('client_id', process.env.OASISCOM_CLIENT_ID || '76db5426-2831-4105-9012-209119e53b5e');
    form.set('client_secret', process.env.OASISCOM_CLIENT_SECRET || '511536EF-F270-4058-80CA-1C89C192F69A');
    form.set('scope', process.env.OASISCOM_SCOPE || 'OasisCo');
    form.set('grant_type', process.env.OASISCOM_GRANT_TYPE || 'password');

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`OasisCom token error ${res.status}: ${text}`);

    const json = JSON.parse(text);
    const token = json.access_token as string;
    const expiresIn = Number(json.expires_in ?? 3600);
    this.tokenCache.set(cacheKey, { token, expiresAt: now + expiresIn * 1000 });
    return token;
  }

  /**
   * Llama un "código_publicación" del API Externo.
   * La publicación define si es "carga" (subida) o "descarga" (consulta) y la estructura del FileBase64.
   */
  async callExternalService(params: {
    context: string;
    companyCode: string;
    publicationCode: string;
    token: string;
    fileBase64: string;
  }): Promise<any> {
    const { context, companyCode, publicationCode, token, fileBase64 } = params;

    const url = `https://app.oasiscom.com/api/externalservices/${encodeURIComponent(context)}/${encodeURIComponent(
      companyCode,
    )}/${encodeURIComponent(publicationCode)}`;

    const form = new URLSearchParams();
    form.set('token', token);
    form.set('FileBase64', fileBase64);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`OasisCom externalservices error ${res.status}: ${text}`);

    // Algunas publicaciones responden JSON; otras texto plano.
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Crea una Orden de Servicio en MORD (vía publicación BINT que tú tengas configurada).
   * - Si falta configuración, no hace nada (y no rompe la creación de la OS en CMMS).
   *
   * IMPORTANTE:
   * - MORD requiere (según manual): Documento, Ubicación, Concepto, Fecha, EquipmentId, Tercero. 
   * - "EquipmentId" suele ser el ID del equipo en MEQU, NO necesariamente el serial.
   * - "Tercero" suele ser el NIT/CC del cliente.
   */
  async createMordFromServiceOrder(input: {
    tenantId: string;
    serviceOrderId: string;
    serviceOrderType: string;
    title: string;
    description?: string | null;
    dueDate?: Date | null;
    asset: {
      code: string;
      serialNumber?: string | null;
      model?: string | null;
      customer?: string | null; // tu campo "cliente" en Asset (si lo tienes)
    };
  }): Promise<any | null> {
    const env = this.env;
    if (!env.enabled) return null;

    // Config mínima requerida
    if (!env.context || !env.companyCode || !env.publicationMordCreate || !env.username || !env.password) {
      this.logger.warn('OasisCom enabled but missing required env vars. Skipping MORD sync.');
      return null;
    }

    const token = await this.getToken(env.context, env.username, env.password);

    const concept = this.mapServiceOrderTypeToConcept(input.serviceOrderType);

    const equipmentId =
      env.equipmentIdSource === 'serialNumber'
        ? input.asset.serialNumber || input.asset.code
        : env.equipmentIdSource === 'model'
          ? input.asset.model || input.asset.code
          : input.asset.code;

    const tercero = input.asset.customer || '';

    // Payload sugerido (ajusta a tu publicación real en OasisCom)
    const payload = {
      source: 'CMMS-IoT',
      tenantId: input.tenantId,
      externalRef: input.serviceOrderId,
      mord: {
        documentId: env.mordDocumentId,
        locationId: env.mordLocationId,
        conceptId: concept,
        date: (input.dueDate ?? new Date()).toISOString(),
        equipmentId,
        tercero,
        title: input.title,
        observation: input.description ?? '',
      },
    };

    const fileBase64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');

    const resp = await this.callExternalService({
      context: env.context,
      companyCode: env.companyCode,
      publicationCode: env.publicationMordCreate,
      token,
      fileBase64,
    });

    return resp;
  }

  private mapServiceOrderTypeToConcept(serviceOrderType: string): string {
    // MORD conceptos del manual: MA, MC, MD, MP, MR, RU
    // Ajusta si tu organización usa otra convención.
    const t = String(serviceOrderType || '').toUpperCase();
    if (t.includes('PREVENT')) return 'MP';
    if (t.includes('CORRECT')) return 'MC';
    if (t.includes('ALIST')) return 'MA'; // o RU, según tu regla de negocio
    if (t.includes('DIAGN')) return 'MA';
    if (t.includes('ENTREGA')) return 'MA';
    return 'MA';
  }
}
