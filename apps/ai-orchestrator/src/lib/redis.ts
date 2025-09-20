import IORedis from "ioredis";
import { config } from "@/config";

const redisClient = new IORedis({
  host: config.cache.host,
  port: config.cache.port,
  maxRetriesPerRequest: null,
});

export { redisClient };
