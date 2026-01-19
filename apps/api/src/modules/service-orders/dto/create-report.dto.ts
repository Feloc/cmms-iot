export class CreateServiceOrderReportDto {
  /** CUSTOMER: para enviar al cliente | INTERNAL: control interno */
  audience!: 'CUSTOMER' | 'INTERNAL';
}
