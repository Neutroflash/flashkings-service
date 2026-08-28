import { IInvoiceRepository } from "../../domain/repositories/IInvoiceRepository";
import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IInvoicingGateway } from "../../domain/services/IInvoicingGateway";
import { Invoice, InvoiceType } from "../../domain/entities/Invoice";
import { ConflictError, NotFoundError } from "../../shared/errors/AppError";

export interface IssueInvoiceInput {
  orderId: string;
  type: InvoiceType;
  documentType: string;
  documentNumber: string;
  businessName?: string;
}

// ADMIN-only, manual action — see the comment on IInvoicingGateway for why this isn't
// auto-triggered off order.paid yet.
export class IssueInvoiceUseCase {
  constructor(
    private readonly invoiceRepository: IInvoiceRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly invoicingGateway: IInvoicingGateway,
  ) {}

  async execute(input: IssueInvoiceInput): Promise<Invoice> {
    const order = await this.orderRepository.findById(input.orderId);
    if (!order) {
      throw new NotFoundError("Orden no encontrada");
    }
    if (!order.paidAt) {
      throw new ConflictError("Solo se puede emitir un comprobante para una orden ya pagada");
    }

    const existing = await this.invoiceRepository.findByOrderId(input.orderId);
    if (existing) {
      throw new ConflictError("Esta orden ya tiene un comprobante emitido");
    }

    // Reserve the series/number FIRST — a real PSE needs its own number to issue the document,
    // it can't be assigned after the fact. See the comment on IInvoiceRepository.reserveNumber.
    const { series, number } = await this.invoiceRepository.reserveNumber(input.type);

    const result = await this.invoicingGateway.issueInvoice({
      order,
      type: input.type,
      series,
      number,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      businessName: input.businessName,
    });

    return this.invoiceRepository.save({
      orderId: input.orderId,
      type: input.type,
      series,
      number,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      businessName: input.businessName,
      status: result.status,
      pdfUrl: result.pdfUrl,
      xmlUrl: result.xmlUrl,
      providerResponse: result.raw,
    });
  }
}
