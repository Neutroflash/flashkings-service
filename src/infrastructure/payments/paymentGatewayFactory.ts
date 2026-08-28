import { IPaymentGateway } from "../../domain/services/IPaymentGateway";
import { env } from "../../config/env";
import { FakePaymentGateway } from "./FakePaymentGateway";
import { CulqiPaymentGateway } from "./CulqiPaymentGateway";

export function createPaymentGateway(): IPaymentGateway {
  return env.payment.gateway === "culqi" ? new CulqiPaymentGateway() : new FakePaymentGateway();
}
