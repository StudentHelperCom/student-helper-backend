import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProcessingService } from './processing.service';
import { ProcessingController } from './processing.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcessingHelpers } from './helpers/processing.helpers';
import { ProcessingAi } from './helpers/processing.ai';
import { User, Class, Topic } from '@repo/database';
import { configValidationSchema } from 'config-validation.schema';

@Module({
  controllers: [ProcessingController],
  providers: [ProcessingService, ProcessingHelpers, ProcessingAi],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      envFilePath: '.env', 
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST!,
      port: 5432,
      username: process.env.DB_USER!,
      password: process.env.DB_PASS!,
      database: process.env.DB_NAME!,
      entities: [User, Class, Topic],
      synchronize: true,
      ssl: { rejectUnauthorized: false },
      autoLoadEntities: true,
    }),
    TypeOrmModule.forFeature([User, Class, Topic]),
  ]
})
export class ProcessingModule {}
