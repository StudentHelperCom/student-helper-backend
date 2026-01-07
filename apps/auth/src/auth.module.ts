import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UsersModule } from './users/users.module';
import { HashService } from './common/hash.service';
import { SharedDatabaseModule } from '@repo/database';
import { configValidationSchema } from '@repo/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      envFilePath: '.env',
    }),
    SharedDatabaseModule.forRoot(),
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('AUTH_JWT_SECRET'),
        signOptions: { expiresIn: '10y' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    HashService,
  ],
})
export class AuthModule {}
