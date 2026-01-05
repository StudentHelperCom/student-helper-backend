import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt/jwt.strategy';
import { CdnController, AuthController, ProcessingController, HealthController, QuizController } from './gateway.controller';
import { configValidationSchema } from './config-validation.schema';


@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      validationSchema: configValidationSchema, // Add validation
      envFilePath: '.env', // Use ../../.env if file is in root
    }),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 600000,
        maxRedirects: 5,
      }),
    }),
    PassportModule
  ],
  controllers: [CdnController, AuthController, ProcessingController, HealthController, QuizController],
  providers: [JwtStrategy], 
})
export class AppModule {}