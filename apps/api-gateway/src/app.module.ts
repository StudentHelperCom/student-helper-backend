import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PassportModule } from '@nestjs/passport';
import { CdnController, AuthController, ProcessingController } from './app.controller';
import { JwtStrategy } from './common/jwt.strategy';

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
  ],
  controllers: [CdnController, AuthController, ProcessingController],
  providers: [JwtStrategy], 
})
export class AppModule {}