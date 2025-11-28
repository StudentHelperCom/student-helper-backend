import { Module } from '@nestjs/common';
import { CdnService } from './cdn.service';
import { CdnController } from './cdn.controller';
import { ServiceHealthController } from './service-health.controller';

@Module({
  controllers: [CdnController, ServiceHealthController],
  providers: [CdnService],
})
export class CdnModule {}
