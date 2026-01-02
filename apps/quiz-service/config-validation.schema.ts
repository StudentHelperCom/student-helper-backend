import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  PORT: Joi.number().integer().default(3003).required(),
  
  AWS_REGION: Joi.string().required(),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_S3_BUCKET: Joi.string().required(),

  GEMINI_API_KEY: Joi.string().required(),
  GEMINI_URL: Joi.string().uri().required(),

  DB_HOST: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_PASS: Joi.string().required(),
  DB_PORT: Joi.number().integer().default(5432).required(),
  DB_SSL: Joi.boolean().default(true),
  DB_USER: Joi.string().required(),
});