import { env } from "../../config/env";
import { IInvoicingGateway } from "../../domain/services/IInvoicingGateway";
import { FakeInvoicingGateway } from "./FakeInvoicingGateway";
import { SunatInvoicingGateway } from "./SunatInvoicingGateway";

// Mismo patrón que paymentGatewayFactory.ts (FakePaymentGateway vs CulqiPaymentGateway) —
// SUNAT_PROVIDER=sunat activa la integración directa con SUNAT (sin PSE/OSE), ver config/env.ts.
export function createInvoicingGateway(): IInvoicingGateway {
  return env.sunat.provider === "sunat" ? new SunatInvoicingGateway() : new FakeInvoicingGateway();
}
