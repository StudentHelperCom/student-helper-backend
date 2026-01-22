import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessingService } from './processing.service';
import { ProcessingController } from './processing.controller';
import { ProcessingLogicService } from './processing-logic.service';
import { ProcessingAiService } from './processing-ai.service';
import { SharedDatabaseModule } from '@repo/database';
import { processingConfigSchema } from '@repo/common';

@Module({
  controllers: [ProcessingController],
  providers: [
    ProcessingService, 
    ProcessingLogicService, 
    ProcessingAiService
  ],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: processingConfigSchema,
      envFilePath: '.env',
    }),
    SharedDatabaseModule.forRoot(), 
  ],
})
export class ProcessingModule {}