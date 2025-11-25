import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { CdnModule } from './cdn.module';

async function bootstrap() {
  const app = await NestFactory.create(CdnModule);
  
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