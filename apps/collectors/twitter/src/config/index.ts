export const config = {
  twitter: {
    bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
    apiKey: process.env.TWITTER_API_KEY || '',
    apiSecret: process.env.TWITTER_API_SECRET || '',
    accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',

    searchQueries: [
      'startup ideas',
      'app ideas',
      'business idea',
      'I wish there was an app',
      'someone should build',
      'would pay for',
      'need a tool for',
      'looking for a solution'
    ],

    maxResultsPerQuery: 100,
    fetchIntervalMinutes: 15,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
  },

  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/twitter-collector',
  },

  queue: {
    name: 'twitter-fetch',
    cronExpression: '*/15 * * * *', // Every 15 minutes
  },

  orchestrator: {
    queueName: 'orchestrator',
    redisConnection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || '',
    }
  },

  rateLimit: {
    tweets: {
      maxRequests: 450,
      windowMs: 15 * 60 * 1000, // 15 minutes
    },
    search: {
      maxRequests: 180,
      windowMs: 15 * 60 * 1000, // 15 minutes
    }
  }
};