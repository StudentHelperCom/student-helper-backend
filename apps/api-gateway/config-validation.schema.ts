import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  PORT: Joi.number().integer().default(4001).required(),
  
  // Microservice URLs
  CDN_URL: Joi.string().uri().required(),
  AUTH_URL: Joi.string().uri().required(),
  PROCESSING_URL: Joi.string().uri().required(),
  QUIZ_SERVICE_URL: Joi.string().uri().required(),

  // Security
  GATEWAY_JWT_SECRET: Joi.string().required(),

  // CORS / Frontend
  FRONTEND_URL: Joi.string().uri().required(),
});