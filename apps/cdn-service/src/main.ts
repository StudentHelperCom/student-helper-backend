import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: parseInt(process.env.CDN_PORT || '4001'),
    },
  });

  await app.listen();
  console.log(`CDN microservice running on port ${process.env.CDN_PORT}`);
}
bootstrap();
