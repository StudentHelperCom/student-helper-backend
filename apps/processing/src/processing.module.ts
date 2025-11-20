import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessingService } from './processing.service';
import { ProcessingController } from './processing.controller';

@Module({
  controllers: [ProcessingController],
  providers: [ProcessingService],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ]
})
export class ProcessingModule {}
