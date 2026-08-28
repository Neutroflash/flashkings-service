import { IStockHoldScheduler } from "../../domain/services/IStockHoldScheduler";

/** No-op scheduler for unit tests that don't need real Redis/BullMQ. */
export class FakeStockHoldScheduler implements IStockHoldScheduler {
  async schedule(): Promise<void> {}
  async cancel(): Promise<void> {}
}
