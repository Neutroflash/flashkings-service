import { IStockHoldScheduler } from "../../domain/services/IStockHoldScheduler";
import { stockHoldQueue } from "./stockHoldQueue";

export class BullMqStockHoldScheduler implements IStockHoldScheduler {
  async schedule(orderId: string, delayMs: number): Promise<void> {
    // jobId = orderId gives natural dedup/lookup and lets cancel() find the job directly.
    await stockHoldQueue.add("expire-order", { orderId }, { jobId: orderId, delay: delayMs });
  }

  async cancel(orderId: string): Promise<void> {
    const job = await stockHoldQueue.getJob(orderId);
    if (job) {
      await job.remove().catch(() => {
        // Job may already be active/completed — releaseHold()/markPaid()'s own idempotency
        // guard (status = PENDING_PAYMENT) is the real safety net, not this cancellation.
      });
    }
  }
}
