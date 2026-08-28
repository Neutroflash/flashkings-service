import IORedis from "ioredis";
import { env } from "../../config/env";

// BullMQ requires maxRetriesPerRequest: null on the connection it's given.
export const redisConnection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
