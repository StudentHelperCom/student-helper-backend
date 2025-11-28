import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessingService } from './processing.service';
import { ProcessingController } from './processing.controller';
import { ServiceHealthController } from './service-health.controller';

@Module({
  controllers: [ProcessingController, ServiceHealthController],
  providers: [ProcessingService],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ]
})
export class ProcessingModule {}
