import { NestFactory } from '@nestjs/core';
import { AppModule } from './gateway.module.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import { clc } from '@nestjs/common/utils/cli-colors.util';
import { json, urlencoded } from 'express';
import { AllExceptionsFilter } from './common/http-exception.filter.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const port = parseInt(process.env.PORT!, 10);

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Student Helper API')
    .setDescription('Microservice Gateway for Student Helper App')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/doc', app, document);

  app.enableCors({
    origin: process.env.FRONTEND_URL!,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  await app.listen(port, '0.0.0.0');
  logger.log(clc.cyanBright(`API Gateway running on port ${port}`));
  logger.log(clc.cyanBright(`Swagger documentation: http://localhost:${port}/api/doc`));
}

bootstrap();