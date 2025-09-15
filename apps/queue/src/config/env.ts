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

  cache: {
    port: parseInt(validatedEnvVars.REDIS_PORT!),
    host: validatedEnvVars.REDIS_HOST,
    ttl: parseInt(process.env.REDIS_TTL!),
  },
});
