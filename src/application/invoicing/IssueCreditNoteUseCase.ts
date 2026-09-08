import { IInvoiceRepository } from "../../domain/repositories/IInvoiceRepository";
import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IRefundRepository } from "../../domain/repositories/IRefundRepository";
import { IInvoicingGateway } from "../../domain/services/IInvoicingGateway";
import { ISunatRetryScheduler } from "../../domain/services/ISunatRetryScheduler";
import { Invoice } from "../../domain/entities/Invoice";
import { findNoteReason, resolveNoteSeries, voidsRelatedInvoice } from "../../infrastructure/invoicing/sunat/note-catalogs";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";

export interface IssueCreditNoteInput {
  /** El reembolso que la nota documenta. De él salen el motivo, el monto y las líneas devueltas. */
  refundId: string;
}

/**
 * ADMIN-only. Emite ante SUNAT la nota de crédito que documenta un reembolso ya hecho.
 *
 * Es un paso separado de RefundOrderUseCase a propósito: devolverle el dinero al cliente no puede
 * quedar bloqueado porque SUNAT esté caído, y una orden que nunca llegó a tener comprobante
 * emitido no necesita ninguna nota. Acá se asume que el dinero ya se movió — esto solo declara el
 * hecho ante SUNAT.
 */
export class IssueCreditNoteUseCase {
  constructor(
    private readonly invoiceRepository: IInvoiceRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly refundRepository: IRefundRepository,
    private readonly invoicingGateway: IInvoicingGateway,
    private readonly sunatRetryScheduler: ISunatRetryScheduler,
  ) {}

  async execute(input: IssueCreditNoteInput): Promise<Invoice> {
    const refund = await this.refundRepository.findById(input.refundId);
    if (!refund) {
      throw new NotFoundError("Reembolso no encontrado");
    }
    if (refund.status === "FAILED") {
      throw new ConflictError("No se emite nota de crédito por un reembolso que falló");
    }

    const order = await this.orderRepository.findById(refund.orderId);
    if (!order) {
      throw new NotFoundError("Orden no encontrada");
    }

    const comprobante = await this.invoiceRepository.findByOrderId(refund.orderId);
    if (!comprobante) {
      throw new ConflictError(
        "Esta orden no tiene comprobante emitido — no hay nada que corregir con una nota de crédito",
      );
    }
    if (comprobante.status !== "ISSUED") {
      throw new ConflictError(
        `El comprobante ${comprobante.series}-${comprobante.number} está en ${comprobante.status}: solo se corrige uno aceptado por SUNAT`,
      );
    }

    // Una nota por reembolso. Sin esto, un doble click emitiría dos notas contra el mismo hecho y
    // quemaría un correlativo que SUNAT no permite reciclar.
    const existingNotes = await this.invoiceRepository.findCreditNotesFor(comprobante.id);
    if (existingNotes.some((n) => n.refundId === refund.id)) {
      throw new ConflictError("Este reembolso ya tiene una nota de crédito emitida");
    }

    const reason = findNoteReason("NOTA_CREDITO", refund.reasonCode);
    if (!reason) {
      throw new ConflictError(`Motivo inválido en el reembolso: ${refund.reasonCode}`);
    }

    const relatedType = comprobante.type === "FACTURA" ? "FACTURA" : "BOLETA";
    const series = resolveNoteSeries(relatedType);

    // Igual que en IssueInvoiceUseCase: el correlativo se reserva ANTES de emitir, porque el
    // documento se firma con su propio número adentro. Un número quemado se anula, no se recicla.
    const reserved = await this.invoiceRepository.reserveNumber("NOTA_CREDITO", series);

    // Las líneas de la nota son las devueltas, no las de la orden entera — así un reembolso
    // parcial produce una nota por lo que realmente volvió.
    const lines = refund.items.length
      ? refund.items.map((refundItem) => {
          const orderItem = order.items.find((i) => i.id === refundItem.orderItemId);
          return {
            description: `${orderItem?.productVariant?.name ?? "Producto"} (${orderItem?.productVariant?.sku ?? "-"})`,
            quantity: refundItem.quantity,
            unitPriceWithTax: orderItem?.price ?? 0,
          };
        })
      : [];

    // Si el reembolso incluyó el flete, la nota tiene que devolverlo también: sus líneas deben
    // sumar exactamente el monto devuelto, o el documento no sustenta la cifra que declara.
    if (lines.length && refund.includesShipping && order.shippingCost > 0) {
      lines.push({
        description: "Servicio de entrega a domicilio",
        quantity: 1,
        unitPriceWithTax: order.shippingCost,
      });
    }

    const result = await this.invoicingGateway.issueCreditNote({
      order,
      relatedInvoice: comprobante,
      series: reserved.series,
      number: reserved.number,
      reasonCode: refund.reasonCode,
      reasonText: refund.reasonText,
      items: lines,
    });

    const note = await this.invoiceRepository.save({
      orderId: refund.orderId,
      type: "NOTA_CREDITO",
      series: reserved.series,
      number: reserved.number,
      // Documento de identidad del comprobante corregido, no el de la orden: la nota tiene que
      // salir a nombre de quien salió la boleta/factura original.
      documentType: comprobante.documentType,
      documentNumber: comprobante.documentNumber,
      businessName: comprobante.businessName ?? undefined,
      status: result.status,
      pdfUrl: result.pdfUrl,
      xmlUrl: result.xmlUrl,
      providerResponse: result.raw,
      signedXml: result.signedXml,
      relatedInvoiceId: comprobante.id,
      noteReasonCode: refund.reasonCode,
      refundId: refund.id,
    });

    // Solo los motivos de anulación total dejan muerto el comprobante original. Un descuento o
    // una devolución por ítem lo dejan vigente con un monto corregido.
    if (result.status === "ISSUED" && voidsRelatedInvoice(refund.reasonCode) && refund.isFull) {
      await this.invoiceRepository.markVoid(comprobante.id);
    }

    if (result.status === "PENDING_SUNAT") {
      await this.sunatRetryScheduler.schedule(note.id, 0);
    }

    return note;
  }
}
