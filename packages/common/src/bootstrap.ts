import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

export async function bootstrap(AppModule: any, serviceName: string) {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const port = parseInt(process.env.PORT!, 10);

  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(port, '0.0.0.0');
  logger.log(`${serviceName} running on port ${port}`);
}
