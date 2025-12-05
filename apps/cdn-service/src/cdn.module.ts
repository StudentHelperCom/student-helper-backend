import { Module } from '@nestjs/common';
import { CdnService } from './cdn.service';
import { CdnController } from './cdn.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  controllers: [CdnController],
  providers: [CdnService],
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
    })]
})
export class CdnModule {}
