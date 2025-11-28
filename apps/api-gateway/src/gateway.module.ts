import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './common/jwt.strategy';
import { HealthController } from './healthchecks/health.controler';
import { TerminusModule } from '@nestjs/terminus';
import { CdnController, AuthController, ProcessingController } from './gateway.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: '.env'
    }),
    HttpModule.registerAsync({
      useFactory: () => ({
        timeout: 30000,
        maxRedirects: 5,
      }),
    }),
    PassportModule,
    TerminusModule
  ],
  controllers: [CdnController, AuthController, ProcessingController, HealthController],
  providers: [JwtStrategy], 
})
export class AppModule {}