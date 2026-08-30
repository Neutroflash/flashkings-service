import { ISunatRetryScheduler } from "../../domain/services/ISunatRetryScheduler";
import { sunatRetryQueue } from "./sunatRetryQueue";

// Backoff creciente (2min, 4min, 8min...) — SUNAT caído no se resuelve reintentando cada pocos
// segundos, y machacar su Web Service con reintentos agresivos no ayuda a nadie.
function backoffMs(attempt: number): number {
  return Math.min(2 ** attempt, 60) * 60 * 1000;
}

export class BullMqSunatRetryScheduler implements ISunatRetryScheduler {
  async schedule(invoiceId: string, attempt: number): Promise<void> {
    // jobId incluye el intento (no solo invoiceId): cada reintento es un job nuevo con su propio
    // delay, puede haber varios encolados en sucesión a medida que cada uno falla.
    await sunatRetryQueue.add("retry", { invoiceId }, { jobId: `${invoiceId}-${attempt}`, delay: backoffMs(attempt) });
  }
}
