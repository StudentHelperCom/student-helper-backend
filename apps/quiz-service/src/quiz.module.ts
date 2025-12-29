import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { ClassEntity, TopicEntity, UserEntity } from '@repo/database';
import { QuizHelpers } from './helpers/quiz.helper';
import { QuizAi } from './helpers/quiz.ai';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: 5432,
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: true, 
      ssl: { rejectUnauthorized: false },
      entities: [TopicEntity, UserEntity, ClassEntity],
    }),
    TypeOrmModule.forFeature([TopicEntity]),
  ],
  controllers: [QuizController],
  providers: [QuizService, QuizHelpers, QuizAi],
})
export class QuizModule {}