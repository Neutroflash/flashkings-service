import { IInvoicingGateway } from "../../domain/services/IInvoicingGateway";
import { FakeInvoicingGateway } from "./FakeInvoicingGateway";

// No real PSE (Nubefact or similar) is wired in yet — see the comment on IInvoicingGateway.
// When one is contracted, add its adapter here behind INVOICING_PROVIDER, the same way
// paymentGatewayFactory.ts switches between FakePaymentGateway and CulqiPaymentGateway.
export function createInvoicingGateway(): IInvoicingGateway {
  return new FakeInvoicingGateway();
}
