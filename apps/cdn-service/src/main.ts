import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const renderPort = parseInt(process.env.PORT || '4001')
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: renderPort,
    },
  });

  await app.listen();
  console.log(`CDN microservice running on port ${renderPort}`);
}
bootstrap();
