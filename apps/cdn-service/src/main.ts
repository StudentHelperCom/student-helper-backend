import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const port = parseInt(process.env.PORT || '3000', 10);
  
  app.use(json({ limit: '50mb' })); // For JSON payloads
  app.use(urlencoded({ extended: true, limit: '50mb' })); // For URL-encoded data
  
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS || [
      'http://localhost:4001',
      'http://localhost:3000',
      'http://localhost:5173', //frontend - change for yourself
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  });

  await app.listen(port, '0.0.0.0');
  console.log(`CDN Service running on port ${port}`);
}

bootstrap();