import { config } from "@/config";
import IORedis from "ioredis";

const redisClient = new IORedis({
  host: config.cache.host,
  port: config.cache.port,
  maxRetriesPerRequest: null,
});

export { redisClient };
