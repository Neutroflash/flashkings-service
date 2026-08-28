import { Queue } from "bullmq";
import { redisConnection } from "./redisConnection";

export const STOCK_HOLD_QUEUE_NAME = "stock-hold";

export const stockHoldQueue = new Queue(STOCK_HOLD_QUEUE_NAME, { connection: redisConnection });
