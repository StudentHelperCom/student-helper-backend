import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { QuizModule } from './quiz.module';
import { clc } from '@nestjs/common/utils/cli-colors.util';

async function bootstrap() {
  const app = await NestFactory.create(QuizModule);
  const logger = new Logger('Bootstrap');
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
  logger.log(clc.cyanBright(`Quiz Microservice running on port ${port}`));
}

bootstrap();
