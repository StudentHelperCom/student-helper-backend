import { NestFactory } from '@nestjs/core';
import { AppModule } from './gateway.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  const port = parseInt(process.env.PORT!, 10);
  
  app.setGlobalPrefix('api');
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Student Helper API Gateway')
    .setDescription('Microservice Gateway for Student Helper App')
    .setVersion('1.0')
    .addTag('CDN')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/doc', app, document);

  app.enableCors({
    origin: process.env.FRONTEND_URL! || ['http://localhost:3000', 'http://localhost:2000'], 
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  await app.listen(port, '0.0.0.0');
  console.log(`API Gateway running on port ${port}`);
  console.log(`Swagger documentation: http://localhost:${port}/api/doc`);
}

bootstrap();
