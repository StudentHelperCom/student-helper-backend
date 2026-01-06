import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt/jwt.strategy.js';
import {
  CdnController,
  AuthController,
  ProcessingController,
  HealthController,
  QuizController,
} from './gateway.controller.js';
import { configValidationSchema } from '@repo/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      envFilePath: '.env',
    }),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 600000,
        maxRedirects: 5,
      }),
    }),
    PassportModule,
  ],
  controllers: [
    CdnController,
    AuthController,
    ProcessingController,
    HealthController,
    QuizController,
  ],
  providers: [JwtStrategy],
})
export class AppModule {}