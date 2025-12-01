import { Module } from '@nestjs/common';
import { CdnService } from './cdn.service';
import { CdnController } from './cdn.controller';
import { HttpModule } from '@nestjs/axios';

@Module({
  controllers: [CdnController],
  providers: [CdnService],
  imports: [HttpModule]
})
export class CdnModule {}
