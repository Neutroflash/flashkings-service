export interface IStockHoldScheduler {
  /** Schedules the stock hold on orderId to be released automatically after delayMs. */
  schedule(orderId: string, delayMs: number): Promise<void>;
  /** Cancels a pending release job, e.g. once the order is paid. Safe to call even if the job already ran. */
  cancel(orderId: string): Promise<void>;
}
