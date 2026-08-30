import { IInvoiceRepository } from "../../domain/repositories/IInvoiceRepository";
import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { NotFoundError, ConflictError } from "../../shared/errors/AppError";
import { generatePDFComprobante } from "../../infrastructure/invoicing/sunat/pdf";
import { DOCUMENT_TYPE_CODE, SunatDocumentTypeCode, SunatInvoicePayload } from "../../infrastructure/invoicing/sunat/types";
import { env } from "../../config/env";

const BUSINESS_DOCUMENT_TYPE_TO_SUNAT: Record<string, SunatDocumentTypeCode> = {
  DNI: DOCUMENT_TYPE_CODE.DNI,
  RUC: DOCUMENT_TYPE_CODE.RUC,
  CE: DOCUMENT_TYPE_CODE.CE,
  PASAPORTE: DOCUMENT_TYPE_CODE.PASAPORTE,
};

/**
 * Genera el PDF bajo demanda (nunca se almacena, mismo criterio que en saas-erp-pe) reconstruyendo
 * el `SunatInvoicePayload` a partir de lo ya guardado en `Invoice` + los ítems de la `Order`
 * relacionada (acá `Invoice` no tiene sus propias líneas — a diferencia de saas-erp-pe, es un
 * negocio único sin necesidad de congelar precios por comprobante separado de la orden).
 */
export class GetInvoicePdfUseCase {
  constructor(
    private readonly invoiceRepository: IInvoiceRepository,
    private readonly orderRepository: IOrderRepository,
  ) {}

  async execute(orderId: string): Promise<Buffer> {
    const invoice = await this.invoiceRepository.findByOrderId(orderId);
    if (!invoice) {
      throw new NotFoundError("Este pedido no tiene un comprobante emitido");
    }
    if (invoice.status !== "ISSUED") {
      throw new ConflictError("El comprobante todavía no fue aceptado por SUNAT");
    }

    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Orden no encontrada");
    }

    const payload: SunatInvoicePayload = {
      tipoDocumento: invoice.type === "FACTURA" ? "01" : "03",
      serie: invoice.series,
      numero: invoice.number,
      fechaEmision: invoice.issuedAt ?? invoice.createdAt,
      emisor: { ruc: env.sunat.ruc, businessName: env.sunat.businessName, address: env.sunat.address || undefined },
      cliente: {
        documentTypeCode: BUSINESS_DOCUMENT_TYPE_TO_SUNAT[invoice.documentType] ?? DOCUMENT_TYPE_CODE.SIN_DOCUMENTO,
        documentNumber: invoice.documentNumber,
        name: invoice.businessName ?? invoice.documentNumber,
      },
      lineas: order.items.map((item) => ({
        description: `${item.productVariant?.name ?? "Producto"} (${item.productVariant?.sku ?? "-"})`,
        quantity: item.quantity,
        unitPriceWithTax: item.price,
      })),
    };

    return generatePDFComprobante(payload);
  }
}
