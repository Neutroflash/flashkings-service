import { ISunatRetryScheduler } from "../../domain/services/ISunatRetryScheduler";

/** No-op scheduler for unit tests that don't need real Redis/BullMQ. */
export class FakeSunatRetryScheduler implements ISunatRetryScheduler {
  async schedule(): Promise<void> {}
}
