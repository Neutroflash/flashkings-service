import { randomUUID } from "crypto";
import { Invoice } from "../../domain/entities/Invoice";
import { IInvoicingGateway, IssueInvoiceInput, IssueInvoiceResult } from "../../domain/services/IInvoicingGateway";

/** Dev/test stand-in: default until SUNAT_PROVIDER=sunat — see the comment on IInvoicingGateway. */
export class FakeInvoicingGateway implements IInvoicingGateway {
  async issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    const fakeId = randomUUID();
    return {
      status: "ISSUED",
      pdfUrl: `https://fake-invoicing.local/${input.series}-${input.number}/${fakeId}.pdf`,
      xmlUrl: `https://fake-invoicing.local/${input.series}-${input.number}/${fakeId}.xml`,
      raw: { fake: true, series: input.series, number: input.number, orderId: input.order.id },
      signedXml: null,
    };
  }

  async retryPending(invoice: Invoice): Promise<IssueInvoiceResult> {
    // Nunca debería llamarse en la práctica: el fake siempre emite ISSUED de una, nunca deja un
    // comprobante en PENDING_SUNAT para reintentar.
    return { status: "ISSUED", pdfUrl: invoice.pdfUrl, xmlUrl: invoice.xmlUrl, raw: { fake: true }, signedXml: invoice.signedXml };
  }
}
