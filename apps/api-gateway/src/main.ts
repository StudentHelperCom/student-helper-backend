import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get('APP_PORT') || 3000;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Student Helper API')
    .setDescription('Microservice Gateway for Student Helper App')
    .setVersion('1.0')
    .addTag('CDN')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/doc', app, document);

  await app.listen(port);
  console.log(`API Gateway running on http://localhost:${port}/api/doc#/`);
}
bootstrap();
