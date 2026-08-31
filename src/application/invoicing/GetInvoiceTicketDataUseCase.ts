import { IInvoiceRepository } from "../../domain/repositories/IInvoiceRepository";
import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { NotFoundError, ConflictError } from "../../shared/errors/AppError";
import { extractDocumentDigestValue } from "../../infrastructure/invoicing/sunat/extract-digest";
import { buildQrContent } from "../../infrastructure/invoicing/sunat/qr";
import { calculateTaxBreakdown } from "../../infrastructure/invoicing/sunat/tax";
import { montoEnLetras } from "../../infrastructure/invoicing/sunat/amount-to-words";
import { DOCUMENT_TYPE_CODE, SunatDocumentTypeCode, SunatInvoicePayload } from "../../infrastructure/invoicing/sunat/types";
import { env } from "../../config/env";

const BUSINESS_DOCUMENT_TYPE_TO_SUNAT: Record<string, SunatDocumentTypeCode> = {
  DNI: DOCUMENT_TYPE_CODE.DNI,
  RUC: DOCUMENT_TYPE_CODE.RUC,
  CE: DOCUMENT_TYPE_CODE.CE,
  PASAPORTE: DOCUMENT_TYPE_CODE.PASAPORTE,
};

// Etiqueta humana del proveedor de pago (Payment.provider es "culqi"/"manual" — ver
// ConfirmManualPaymentUseCase/CulqiPaymentGateway) — nunca se inventa un medio de pago más
// específico (YAPE/PLIN puntual) porque no se guarda esa granularidad hoy.
const PAYMENT_PROVIDER_LABEL: Record<string, string> = {
  culqi: "Tarjeta / Yape / Plin (Culqi)",
  manual: "Confirmado manualmente",
};

export interface TicketComprobanteData {
  emisor: { businessName: string; ruc: string; address: string; phone?: string };
  comprobante: { tipo: "BOLETA" | "FACTURA"; serie: string; numero: number; fechaEmision: string };
  cliente: { nombre: string; documentoTipo: string; documentoNumero: string };
  pago: { forma: "CONTADO" | "CREDITO"; medio?: string };
  items: { cantidad: number; descripcion: string; precioUnitario: number; importe: number }[];
  totales: { opGravada: number; igv: number; opExonerada?: number; opInafecta?: number; total: number; montoEnLetras: string };
  qrContent: string;
  hash: string;
}

/**
 * Mismo criterio que GetInvoicePdfUseCase (payload reconstruido desde Invoice+Order, nunca
 * almacenado) pero devuelve JSON en vez de un PDF — para el componente `TicketComprobante` del
 * frontend, que es puramente presentacional y no debe reimplementar el cálculo del hash/monto en
 * letras. Todas las ventas del proyecto son al contado (no hay venta a crédito) — mismo criterio
 * que el `cac:PaymentTerms` fijo agregado al XML de factura.
 */
export class GetInvoiceTicketDataUseCase {
  constructor(
    private readonly invoiceRepository: IInvoiceRepository,
    private readonly orderRepository: IOrderRepository,
  ) {}

  async execute(orderId: string): Promise<TicketComprobanteData> {
    const invoice = await this.invoiceRepository.findByOrderId(orderId);
    if (!invoice) throw new NotFoundError("Este pedido no tiene un comprobante emitido");
    if (invoice.status !== "ISSUED") throw new ConflictError("El comprobante todavía no fue aceptado por SUNAT");

    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundError("Orden no encontrada");

    const totalVenta = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const { taxedAmount, igvAmount } = calculateTaxBreakdown(totalVenta);

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

    // invoice.signedXml siempre está presente para un comprobante ISSUED vía SunatInvoicingGateway
    // (se firma antes de enviar) — solo faltaría con el gateway fake.
    const documentDigest = invoice.signedXml ? extractDocumentDigestValue(invoice.signedXml) : "";
    const qrContent = buildQrContent(payload, documentDigest);

    return {
      emisor: { businessName: env.sunat.businessName, ruc: env.sunat.ruc, address: env.sunat.address },
      comprobante: {
        tipo: invoice.type,
        serie: invoice.series,
        numero: invoice.number,
        fechaEmision: (invoice.issuedAt ?? invoice.createdAt).toISOString(),
      },
      cliente: {
        // Razón social si es factura; si es boleta (sin businessName), el nombre real del
        // cliente de la orden — nunca el número de documento como fallback de "nombre".
        nombre: invoice.businessName ?? order.customerName,
        documentoTipo: invoice.documentType,
        documentoNumero: invoice.documentNumber,
      },
      pago: {
        forma: "CONTADO",
        medio: order.payment ? (PAYMENT_PROVIDER_LABEL[order.payment.provider] ?? order.payment.provider) : undefined,
      },
      items: order.items.map((item) => ({
        cantidad: item.quantity,
        descripcion: `${item.productVariant?.name ?? "Producto"} (${item.productVariant?.sku ?? "-"})`,
        precioUnitario: item.price,
        importe: item.price * item.quantity,
      })),
      totales: {
        opGravada: taxedAmount,
        igv: igvAmount,
        total: totalVenta,
        montoEnLetras: montoEnLetras(totalVenta),
      },
      qrContent,
      hash: documentDigest,
    };
  }
}
