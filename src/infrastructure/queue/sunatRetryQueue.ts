import { Queue } from "bullmq";
import { redisConnection } from "./redisConnection";

export const SUNAT_RETRY_QUEUE_NAME = "sunat-retry";

export const sunatRetryQueue = new Queue(SUNAT_RETRY_QUEUE_NAME, { connection: redisConnection });
