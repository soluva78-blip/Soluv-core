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

    DATABASE_NAME: Joi.string().required(),
    DATABASE_HOST: Joi.string().required(),
    DATABASE_USER: Joi.string().required(),
    DATABASE_PASSWORD: Joi.string().allow("").required(),
    DATABASE_TYPE: Joi.string().required(),
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
    dbUser: validatedEnvVars.DATABASE_USER,
    dbPassword: validatedEnvVars.DATABASE_PASSWORD,
    dbHost: validatedEnvVars.DATABASE_HOST,
    dbName: validatedEnvVars.DATABASE_NAME,
    dbType: validatedEnvVars.DATABASE_TYPE,
  },

  cache: {
    port: parseInt(process.env.REDIS_PORT!),
    host: process.env.REDIS_HOST,
    ttl: parseInt(process.env.REDIS_TTL!),
  },
});
