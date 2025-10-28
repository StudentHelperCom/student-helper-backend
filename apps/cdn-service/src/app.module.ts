import { Module } from '@nestjs/common';
import { CdnModule } from './cdn/cdn.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    CdnModule,
    ConfigModule.forRoot({ isGlobal: true }),
  ],
})
export class AppModule {}
