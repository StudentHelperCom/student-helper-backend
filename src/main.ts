import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import helmet from 'helmet';
import * as path from 'path';
import { join } from 'path';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { InternalServerErrorException, ValidationPipe } from '@nestjs/common';
import { initSwagger } from './app.swagger';

async function bootstrap(): Promise<void> {
  const dirPath = path.join(__dirname, '../upload');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true,
  });

  if (process.env.SENTRY_ENABLE === 'true') {
    console.log('Sentry init');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [nodeProfilingIntegration()],
      tracesSampleRate: 1.0,
      profilesSampleRate: 1.0,
    });
  }

  const configService = app.get(ConfigService);
  const swaggerName = configService.get<string>('SWAGGER_ADMIN_NAME');
  const swaggerPass = configService.get<string>('SWAGGER_ADMIN_PASS');

  if (!swaggerName) {
    throw new InternalServerErrorException('Swagger admin name is not set in .env file');
  }
  if (!swaggerPass) {
    throw new InternalServerErrorException('Swagger admin pass is not set in .env file');
  }

  const apiPrefix = 'api';
  app.setGlobalPrefix(apiPrefix);
  initSwagger(
    app,
    {
      name: swaggerName,
      pass: swaggerPass,
    },
    apiPrefix,
  );

  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: `/${apiPrefix}/public`,
  });
  app.setBaseViewsDir(join(__dirname, '..', 'views'));
  app.setViewEngine('hbs');
  app.use(helmet());

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidNonWhitelisted: true,
      whitelist: true,
    }),
  );

  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  app.use(bodyParser.json({ limit: '50mb' }));

  const port: number = process.env.APP_PORT ? +process.env.APP_PORT : 3000;
  await app.listen(port);
  console.log(`App launched on port ${port}`);
}

bootstrap();
