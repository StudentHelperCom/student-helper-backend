import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  PORT: Joi.number().integer().default(3002).required(),
  
  // Security
  AUTH_JWT_SECRET: Joi.string().required(),
  BLOCK_TIME_BETWEEN_SENDING_VERIFICATION_CODE_IN_SECONDS: Joi.number().integer().default(60).required(),

  // Database
  DB_HOST: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_PASS: Joi.string().required(),
  DB_PORT: Joi.number().integer().default(5432).required(),
  DB_SSL: Joi.boolean().default(true),
  DB_USER: Joi.string().required(),
});