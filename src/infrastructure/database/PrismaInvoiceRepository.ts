import { Prisma, PrismaClient } from "@prisma/client";
import {
  IInvoiceRepository,
  ReservedInvoiceNumber,
  RetryResultData,
  SaveInvoiceData,
} from "../../domain/repositories/IInvoiceRepository";
import { Invoice, InvoiceType } from "../../domain/entities/Invoice";

// Fixed per type: SUNAT's convention for a business's first (and, here, only) point of emission.
// NOTA_CREDITO has no fixed entry: its series depends on which document it corrects (BC01 over a
// boleta, FC01 over a factura), so the caller passes it explicitly — see resolveNoteSeries.
const SERIES: Record<Exclude<InvoiceType, "NOTA_CREDITO">, string> = {
  BOLETA: "B001",
  FACTURA: "F001",
};

function toDomain(invoice: Prisma.InvoiceGetPayload<Record<string, never>>): Invoice {
  return { ...invoice } as Invoice;
}

export class PrismaInvoiceRepository implements IInvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveNumber(type: InvoiceType, series?: string): Promise<ReservedInvoiceNumber> {
    const resolvedSeries = series ?? SERIES[type as Exclude<InvoiceType, "NOTA_CREDITO">];
    if (!resolvedSeries) {
      throw new Error(`reserveNumber(${type}) requiere una serie explícita`);
    }

    // upsert+increment on a dedicated counter row is atomic under Postgres's row lock — the same
    // reasoning as the stock-hold FOR UPDATE pattern, just via Prisma's native increment since
    // there's no availability check to make here, only a monotonic counter.
    const counter = await this.prisma.invoiceCounter.upsert({
      where: { type_series: { type, series: resolvedSeries } },
      create: { type, series: resolvedSeries, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return { series: resolvedSeries, number: counter.lastNumber };
  }

  async save(data: SaveInvoiceData): Promise<Invoice> {
    const invoice = await this.prisma.invoice.create({
      data: {
        orderId: data.orderId,
        type: data.type,
        status: data.status,
        series: data.series,
        number: data.number,
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        businessName: data.businessName,
        pdfUrl: data.pdfUrl,
        xmlUrl: data.xmlUrl,
        providerResponse: data.providerResponse as Prisma.InputJsonValue,
        signedXml: data.signedXml,
        issuedAt: data.status === "ISSUED" ? new Date() : null,
        relatedInvoiceId: data.relatedInvoiceId ?? null,
        noteReasonCode: data.noteReasonCode ?? null,
        refundId: data.refundId ?? null,
      },
    });
    return toDomain(invoice);
  }

  async findByOrderId(orderId: string): Promise<Invoice | null> {
    // orderId dejó de ser único cuando aparecieron las notas de crédito — "el comprobante de esta
    // orden" es el que NO es nota.
    const invoice = await this.prisma.invoice.findFirst({
      where: { orderId, type: { not: "NOTA_CREDITO" } },
    });
    return invoice ? toDomain(invoice) : null;
  }

  async findCreditNotesFor(invoiceId: string): Promise<Invoice[]> {
    const notes = await this.prisma.invoice.findMany({
      where: { relatedInvoiceId: invoiceId, type: "NOTA_CREDITO" },
      orderBy: { createdAt: "desc" },
    });
    return notes.map(toDomain);
  }

  async markVoid(invoiceId: string): Promise<void> {
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { status: "VOID" } });
  }

  async findById(id: string): Promise<Invoice | null> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id } });
    return invoice ? toDomain(invoice) : null;
  }

  async updateRetryResult(id: string, data: RetryResultData): Promise<void> {
    await this.prisma.invoice.update({
      where: { id },
      data: {
        status: data.status,
        providerResponse: data.providerResponse as Prisma.InputJsonValue,
        sunatRetryCount: data.sunatRetryCount,
        issuedAt: data.status === "ISSUED" ? new Date() : null,
      },
    });
  }

  async incrementRetryCount(id: string): Promise<void> {
    await this.prisma.invoice.update({ where: { id }, data: { sunatRetryCount: { increment: 1 } } });
  }
}
