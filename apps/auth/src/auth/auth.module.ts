// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtModule } from '@nestjs/jwt';
import { HashService } from '../common/hash.service';
import { AuthController } from './auth.controller';
import { UsersModule } from 'src/users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config'; // Import these

@Module({
  imports: [
    UsersModule, //
    // Use registerAsync to safely load the secret from .env
    JwtModule.registerAsync({
      imports: [ConfigModule], // Import ConfigModule here
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'), // Use the key from your .env
        signOptions: { expiresIn: '10y' },
      }),
    }),
  ],
  controllers: [AuthController], //
  providers: [AuthService, UsersService, HashService], //
})
export class AuthModule {}