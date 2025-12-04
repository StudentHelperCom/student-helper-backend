import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessingService } from './processing.service';
import { ProcessingController } from './processing.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessingHelpers } from './helpers/processing.helpers';
import { ProcessingAi } from './helpers/processing.ai';


@Module({
  controllers: [ProcessingController],
  providers: [ProcessingService, ProcessingHelpers, ProcessingAi],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: 5432,
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      entities: [],
      synchronize: true,
      ssl: { rejectUnauthorized: false },
      autoLoadEntities: true,
    }),
  ]
})
export class ProcessingModule {}
