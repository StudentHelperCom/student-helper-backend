// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtModule } from '@nestjs/jwt';
import { HashService } from '../common/hash.service';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config'; 
import { ServiceHealthController } from 'src/service-health.controller';

@Module({
  imports: [
    UsersModule, //
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('AUTH_JWT_SECRET'), 
        signOptions: { expiresIn: '10y' },
      }),
    }),
  ],
  controllers: [AuthController, ServiceHealthController], 
  providers: [AuthService, UsersService, HashService], 
})
export class AuthModule {}