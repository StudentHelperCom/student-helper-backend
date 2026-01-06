import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizController } from './quiz.controller.js';
import { QuizService } from './quiz.service.js';
import { User, Class, Topic, SharedDatabaseModule } from '@repo/database';
import { configValidationSchema } from '@repo/common';
import { QuizAiService } from './quiz-ai.service.js';
import { QuizLogicService } from './quiz-logic.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      envFilePath: '.env',
    }),
    SharedDatabaseModule.forRoot(),
    TypeOrmModule.forFeature([User, Class, Topic]),
  ],
  controllers: [QuizController],
  providers: [QuizService, QuizLogicService, QuizAiService],
})
export class QuizModule {}