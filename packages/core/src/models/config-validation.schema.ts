import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  APP_PORT: Joi.number().integer().default(3000).required(),
  SENTRY_ENABLE: Joi.boolean().required(),
  SWAGGER_ADMIN_NAME: Joi.string().required(),
  SWAGGER_ADMIN_PASS: Joi.string().required(),
  DATABASE_URL: Joi.string().uri().required(),
});