import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  const port = parseInt(process.env.CDN_PORT || '3001', 10);
  
  app.use(json({ limit: '50mb' })); // For JSON payloads
  app.use(urlencoded({ extended: true, limit: '50mb' })); // For URL-encoded data
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  await app.listen(port, '0.0.0.0');
  console.log(`CDN Service running on port ${port}`);
}

bootstrap();