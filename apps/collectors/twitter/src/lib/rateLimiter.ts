import Bottleneck from 'bottleneck';
import { config } from '../config';

export const searchRateLimiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: Math.ceil(config.rateLimit.search.windowMs / config.rateLimit.search.maxRequests),
  reservoir: config.rateLimit.search.maxRequests,
  reservoirRefreshAmount: config.rateLimit.search.maxRequests,
  reservoirRefreshInterval: config.rateLimit.search.windowMs,
});

export const tweetRateLimiter = new Bottleneck({
  maxConcurrent: 2,
  minTime: Math.ceil(config.rateLimit.tweets.windowMs / config.rateLimit.tweets.maxRequests),
  reservoir: config.rateLimit.tweets.maxRequests,
  reservoirRefreshAmount: config.rateLimit.tweets.maxRequests,
  reservoirRefreshInterval: config.rateLimit.tweets.windowMs,
});