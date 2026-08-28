import { Prisma, PrismaClient } from "@prisma/client";
import {
  IInvoiceRepository,
  ReservedInvoiceNumber,
  SaveInvoiceData,
} from "../../domain/repositories/IInvoiceRepository";
import { Invoice, InvoiceType } from "../../domain/entities/Invoice";

// Fixed per type: SUNAT's convention for a business's first (and, here, only) point of emission.
const SERIES: Record<InvoiceType, string> = {
  BOLETA: "B001",
  FACTURA: "F001",
};

function toDomain(invoice: Prisma.InvoiceGetPayload<Record<string, never>>): Invoice {
  return { ...invoice };
}

export class PrismaInvoiceRepository implements IInvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserveNumber(type: InvoiceType): Promise<ReservedInvoiceNumber> {
    // upsert+increment on a dedicated counter row is atomic under Postgres's row lock — the same
    // reasoning as the stock-hold FOR UPDATE pattern, just via Prisma's native increment since
    // there's no availability check to make here, only a monotonic counter.
    const counter = await this.prisma.invoiceCounter.upsert({
      where: { type },
      create: { type, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return { series: SERIES[type], number: counter.lastNumber };
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
        issuedAt: data.status === "ISSUED" ? new Date() : null,
      },
    });
    return toDomain(invoice);
  }

  async findByOrderId(orderId: string): Promise<Invoice | null> {
    const invoice = await this.prisma.invoice.findUnique({ where: { orderId } });
    return invoice ? toDomain(invoice) : null;
  }
}
