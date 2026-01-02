import { Module } from '@nestjs/common';
import { CdnService } from './cdn.service';
import { CdnController } from './cdn.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Class, User, Topic } from '@repo/database';
import { configValidationSchema } from './config-validation.schema';

@Module({
  controllers: [CdnController],
  providers: [CdnService],
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      envFilePath: '.env', 
    }),
    TypeOrmModule.forFeature([User, Class, Topic]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        entities: [User, Class, Topic],
        synchronize: true,
        ssl: config.get<boolean>('DB_SSL') ? { rejectUnauthorized: false } : false,
        autoLoadEntities: true,
      }),
    }),
  ]
})
export class CdnModule {}