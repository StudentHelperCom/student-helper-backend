import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { SharedDatabaseModule } from '@repo/database';
import { quizConfigSchema } from '@repo/common';
import { QuizAiService } from './quiz-ai.service';
import { QuizLogicService } from './quiz-logic.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: quizConfigSchema,
      envFilePath: '.env',
    }),
    SharedDatabaseModule.forRoot(),
  ],
  controllers: [QuizController],
  providers: [
    QuizService, 
    QuizLogicService, 
    QuizAiService, 
  ],
})
export class QuizModule {}