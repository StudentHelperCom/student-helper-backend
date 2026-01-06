import Joi from 'joi';

/**
 * Base configuration schema shared by all services
 */
const baseConfigSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().integer().required(),
});

/**
 * Database configuration schema for services using PostgreSQL
 */
const databaseConfigSchema = Joi.object({
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().integer().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
});

/**
 * AWS S3 configuration schema for services using S3
 */
const awsConfigSchema = Joi.object({
  AWS_REGION: Joi.string().required(),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_S3_BUCKET: Joi.string().required(),
});

/**
 * Gemini AI configuration schema for services using AI
 */
const geminiConfigSchema = Joi.object({
  GEMINI_API_KEY: Joi.string().required(),
  GEMINI_URL: Joi.string().uri().required(),
});

/**
 * JWT configuration schema for authentication
 */
const jwtConfigSchema = Joi.object({
  JWT_SECRET: Joi.string().required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
});

/**
 * Helper function to create service-specific configuration schemas
 * by merging base schema with additional schemas
 */
export const createConfigSchema = (...schemas: Joi.ObjectSchema[]): Joi.ObjectSchema => {
  return schemas.reduce((acc, schema) => acc.concat(schema), Joi.object({}));
};

// =========================================================================
// === PRE-BUILT SERVICE-SPECIFIC SCHEMAS ===
// =========================================================================

/**
 * API Gateway configuration schema
 */
export const gatewayConfigSchema = createConfigSchema(
  baseConfigSchema,
  databaseConfigSchema,
  jwtConfigSchema,
  Joi.object({
    CDN_URL: Joi.string().uri().required(),
    AUTH_URL: Joi.string().uri().required(),
    PROCESSING_URL: Joi.string().uri().required(),
    QUIZ_SERVICE_URL: Joi.string().uri().required(),
    FRONTEND_URL: Joi.string().uri().required(),
  })
);

/**
 * Auth service configuration schema
 */
export const authConfigSchema = createConfigSchema(
  baseConfigSchema,
  databaseConfigSchema,
  jwtConfigSchema
);

/**
 * CDN service configuration schema
 */
export const cdnConfigSchema = createConfigSchema(
  baseConfigSchema,
  databaseConfigSchema,
  awsConfigSchema,
  Joi.object({
    PROCESSING_URL: Joi.string().uri().required(),
  })
);

/**
 * Processing service configuration schema
 */
export const processingConfigSchema = createConfigSchema(
  baseConfigSchema,
  databaseConfigSchema,
  awsConfigSchema,
  geminiConfigSchema
);

/**
 * Quiz service configuration schema
 */
export const quizConfigSchema = createConfigSchema(
  baseConfigSchema,
  databaseConfigSchema,
  awsConfigSchema,
  geminiConfigSchema
);

// =========================================================================
// === EXPORT INDIVIDUAL SCHEMA COMPONENTS ===
// =========================================================================

export {
  baseConfigSchema,
  databaseConfigSchema,
  awsConfigSchema,
  geminiConfigSchema,
  jwtConfigSchema,
};
