import { config } from "./env";
import Redis from "ioredis";

export const redisConfig = {
  host: config.cache.host,
  port: config.cache.port,
};

export const redis = new Redis(redisConfig);