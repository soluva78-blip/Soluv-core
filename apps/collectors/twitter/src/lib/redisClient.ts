import Redis from 'ioredis';
import { config } from '../config';

export const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: 3,
});