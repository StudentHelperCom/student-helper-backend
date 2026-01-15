import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessingService } from './processing.service';
import { ProcessingController } from './processing.controller';
import { ProcessingHelpers } from './helpers/processing.helpers';
import { ProcessingAi } from './helpers/processing.ai';
import { SharedDatabaseModule } from '@repo/database';
import { processingConfigSchema } from '@repo/common';

@Module({
  controllers: [ProcessingController],
  providers: [
    ProcessingService, 
    ProcessingHelpers, 
    ProcessingAi
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