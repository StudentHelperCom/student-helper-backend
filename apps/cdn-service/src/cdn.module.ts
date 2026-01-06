import { Module } from '@nestjs/common';
import { CdnService } from './cdn.service.js';
import { CdnController } from './cdn.controller.js';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Class, User, Topic, SharedDatabaseModule } from '@repo/database';
import { configValidationSchema } from '@repo/common';

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
    SharedDatabaseModule.forRoot(),
    TypeOrmModule.forFeature([User, Class, Topic]),
  ],
})
export class CdnModule {}