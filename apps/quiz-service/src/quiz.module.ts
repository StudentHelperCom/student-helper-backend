import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { User, Class, Topic } from '@repo/database';

import { configValidationSchema } from './config-validation.schema'; 
import { QuizAiService } from './quiz-ai.service';
import { QuizLogicService } from './quiz-logic.service';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      validationSchema: configValidationSchema,
      envFilePath: '.env', 
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        entities: [User, Class, Topic],
        autoLoadEntities: true,
        synchronize: true, 
        ssl: config.get<boolean>('DB_SSL') ? { rejectUnauthorized: false } : false,
      }),
    }),
    TypeOrmModule.forFeature([User, Class, Topic]),
  ],
  controllers: [QuizController],
  providers: [QuizService, QuizLogicService, QuizAiService],
})
export class QuizModule {}