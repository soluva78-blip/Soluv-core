import * as dotenv from "dotenv";
import * as Joi from "joi";

dotenv.config();
type INodeEnv = "development" | "production" | "staging";

// Define validation schema for environment variables
const envSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string()
      .valid("development", "production", "staging")
      .required(),
    PORT: Joi.number().required(),
    MONGO_URI: Joi.string().required(),

    // Supabase
    SUPABASE_URL: Joi.string().required(),
    SUPABASE_KEY: Joi.string().required(),

    // Redis
    REDIS_HOST: Joi.string().required(),
    REDIS_PORT: Joi.string().required(),
    REDIS_TTL: Joi.string()
      .custom((value) => Number(value))
      .default("3600"),

    // OpenAI
    OPENAI_API_KEY: Joi.string().min(1),
    OPENAI_MODEL: Joi.string().default("gpt-4-turbo-preview"),
    EMBEDDING_MODEL: Joi.string().default("text-embedding-ada-002"),

    // Orchestration & Processing
    ORCH_CONCURRENCY: Joi.number().default(1),
    BATCH_SIZE: Joi.number().default(10),
    RATE_LIMIT_PER_MINUTE: Joi.number().default(60),
    CLUSTER_SIMILARITY_THRESHOLD: Joi.number().default(0.7),
    CENTROID_UPDATE_BATCH_SIZE: Joi.number().default(100),
    RETRY_ATTEMPTS: Joi.number().default(3),
    RETRY_DELAY_MS: Joi.number().default(1000),

    // Limits
    MAX_TOKENS_PER_MINUTE: Joi.number().default(100000),
    MAX_REQUESTS_PER_MINUTE: Joi.number().default(100),
    MIN_CLUSTER_SIZE: Joi.number().default(5),

    // Monitoring
    METRICS_PORT: Joi.number().default(9090),
  })
  .unknown();

// Validate environment variables against the schema
const { value: validatedEnvVars, error: validationError } = envSchema
  .prefs({ errors: { label: "key" } })
  .validate(process.env);

if (validationError) {
  throw new Error(`Config validation error: ${validationError.message}`);
}

export const config = Object.freeze({
  app: {
    environment: validatedEnvVars.NODE_ENV as INodeEnv,
    port: validatedEnvVars.PORT,
  },

  mongo_url: validatedEnvVars.MONGO_URI,

  supabase: {
    url: validatedEnvVars.SUPABASE_URL,
    key: validatedEnvVars.SUPABASE_KEY,
  },

  cache: {
    host: validatedEnvVars.REDIS_HOST,
    port: parseInt(validatedEnvVars.REDIS_PORT!),
    ttl: validatedEnvVars.REDIS_TTL,
  },

  openai: {
    apiKey: validatedEnvVars.OPENAI_API_KEY,
    model: validatedEnvVars.OPENAI_MODEL,
    embeddingModel: validatedEnvVars.EMBEDDING_MODEL,
  },

  orchestration: {
    concurrency: validatedEnvVars.ORCH_CONCURRENCY,
    batchSize: validatedEnvVars.BATCH_SIZE,
    rateLimitPerMinute: validatedEnvVars.RATE_LIMIT_PER_MINUTE,
    clusterSimilarityThreshold: validatedEnvVars.CLUSTER_SIMILARITY_THRESHOLD,
    centroidUpdateBatchSize: validatedEnvVars.CENTROID_UPDATE_BATCH_SIZE,
    retryAttempts: validatedEnvVars.RETRY_ATTEMPTS,
    retryDelayMs: validatedEnvVars.RETRY_DELAY_MS,
  },

  limits: {
    maxTokensPerMinute: validatedEnvVars.MAX_TOKENS_PER_MINUTE,
    maxRequestsPerMinute: validatedEnvVars.MAX_REQUESTS_PER_MINUTE,
    minClusterSize: validatedEnvVars.MIN_CLUSTER_SIZE,
  },

  monitoring: {
    metricsPort: validatedEnvVars.METRICS_PORT,
  },
});
