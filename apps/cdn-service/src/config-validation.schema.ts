import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  PORT: Joi.number().integer().default(3001).required(),
  
  // AWS S3 Configuration
  AWS_REGION: Joi.string().required(),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_S3_BUCKET: Joi.string().required(),

  // Database Configuration
  DB_HOST: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_PASS: Joi.string().required(),
  DB_PORT: Joi.number().integer().default(5432).required(),
  DB_SSL: Joi.boolean().default(true),
  DB_USER: Joi.string().required(),

  // Microservices
  PROCESSING_URL: Joi.string().uri().required(),
});