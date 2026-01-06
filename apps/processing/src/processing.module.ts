import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessingService } from './processing.service.js';
import { ProcessingController } from './processing.controller.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessingHelpers } from './helpers/processing.helpers.js';
import { ProcessingAi } from './helpers/processing.ai.js';
import { User, Class, Topic, SharedDatabaseModule } from '@repo/database';
import { configValidationSchema } from '@repo/common';

@Module({
  controllers: [ProcessingController],
  providers: [ProcessingService, ProcessingHelpers, ProcessingAi],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      envFilePath: '.env',
    }),
    SharedDatabaseModule.forRoot(),
    TypeOrmModule.forFeature([User, Class, Topic]),
  ],
})
export class ProcessingModule {}
