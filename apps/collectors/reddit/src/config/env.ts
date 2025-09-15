import * as dotenv from "dotenv";
import * as Joi from "joi";

dotenv.config();
type INodeEnv = "development" | "production" | "staging";

// Define validation schema for environment variables
const envSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid("development", "production", "staging", "test")
      .required(),

    MONGO_URI: Joi.string().required(),

    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.string().required(),

    REDDIT_USER_AGENT: Joi.string().required(),
    REDDIT_CLIENT_ID: Joi.string().required(),
    REDDIT_CLIENT_SECRET: Joi.string().required(),
    REDDIT_USERNAME: Joi.string().required(),
    REDDIT_PASSWORD: Joi.string().required(),

    REDDIT_SUBREDDITS: Joi.string().required(),
    REDDIT_MIN_SCORE: Joi.number().default(30),
    REDDIT_FETCH_LIMIT: Joi.number().default(25),
    REDDIT_SORT: Joi.string().valid("hot", "top", "new").default("top"),
    REDDIT_TIMEFRAME: Joi.string().valid("hour", "day", "week").default("day"),
    PROBLEM_KEYWORDS: Joi.string().default("problem,issue,challenge"),
    EXCLUDE_KEYWORDS: Joi.string().default("meme,spam"),
    MIN_TITLE_LENGTH: Joi.number().default(10),
    MAX_TITLE_LENGTH: Joi.number().default(150),

    CRON_EXPRESSION: Joi.string().default("*/1 * * * *"),
    TIMEZONE: Joi.string().default("UTC"),
  })
  .unknown();

// Validate environment variables against the schema
const { value: validatedEnvVars, error: validationError } = envSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env);

// Throw an error if validation fails
if (validationError) {
  throw new Error(`Config validation error: ${validationError.message}`);
}

export const config = Object.freeze({
  port: validatedEnvVars.PORT,

  appEnvironment: validatedEnvVars.NODE_ENV as INodeEnv,

  db: {
    uri: validatedEnvVars.MONGO_URI,
  },

  reddit: {
    userAgent: validatedEnvVars.REDDIT_USER_AGENT,
    clientId: validatedEnvVars.REDDIT_CLIENT_ID,
    clientSecret: validatedEnvVars.REDDIT_CLIENT_SECRET,
    userName: validatedEnvVars.REDDIT_USERNAME,
    password: validatedEnvVars.REDDIT_PASSWORD,
  },

  redditFetchConfig: {
    subreddits: validatedEnvVars.REDDIT_SUBREDDITS?.split(","),
    minScore: validatedEnvVars.REDDIT_MIN_SCORE,
    fetchLimit: validatedEnvVars.REDDIT_FETCH_LIMIT,
    sort: validatedEnvVars.REDDIT_SORT,
    timeframe: validatedEnvVars.REDDIT_TIMEFRAME,
    problemKeywords: validatedEnvVars.PROBLEM_KEYWORDS?.split(","),
    excludeKeywords: validatedEnvVars.EXCLUDE_KEYWORDS?.split(","),
    minTitleLength: validatedEnvVars.MIN_TITLE_LENGTH,
    maxTitleLength: validatedEnvVars.MAX_TITLE_LENGTH,
  },

  queue: {
    name: "fetch-subreddit",
  },

  cache: {
    port: parseInt(validatedEnvVars.REDIS_PORT!),
    host: validatedEnvVars.REDIS_HOST,
    ttl: parseInt(process.env.REDIS_TTL!),
  },
});
