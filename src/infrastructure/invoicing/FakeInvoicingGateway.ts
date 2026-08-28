import { randomUUID } from "crypto";
import { IInvoicingGateway, IssueInvoiceInput, IssueInvoiceResult } from "../../domain/services/IInvoicingGateway";

/** Dev/test stand-in: no real PSE contracted yet — see the comment on IInvoicingGateway. */
export class FakeInvoicingGateway implements IInvoicingGateway {
  async issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
    const fakeId = randomUUID();
    return {
      status: "ISSUED",
      pdfUrl: `https://fake-invoicing.local/${input.series}-${input.number}/${fakeId}.pdf`,
      xmlUrl: `https://fake-invoicing.local/${input.series}-${input.number}/${fakeId}.xml`,
      raw: { fake: true, series: input.series, number: input.number, orderId: input.order.id },
    };
  }
}
