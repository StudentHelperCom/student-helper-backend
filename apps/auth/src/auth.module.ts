import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SharedDatabaseModule} from '@repo/database';
import { authConfigSchema } from '@repo/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HashService } from './common/hash.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: authConfigSchema,
      envFilePath: '.env',
    }),
    SharedDatabaseModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1d' },
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