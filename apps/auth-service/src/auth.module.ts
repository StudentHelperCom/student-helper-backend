import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SharedDatabaseModule, User, Class, Topic } from '@repo/database';
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
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        entities: [User, Class, Topic],
        synchronize: config.get('NODE_ENV') !== 'production',
        ssl: config.get<boolean>('DB_SSL') 
          ? { rejectUnauthorized: false } 
          : false,
        autoLoadEntities: true,
      }),
    }),
    SharedDatabaseModule.forRoot(),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
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