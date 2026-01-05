import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Topic } from '@repo/database';
import { StudyMode } from '@repo/common';
import { QuizAiService } from './quiz-ai.service';
import { QuizLogicService } from './quiz-logic.service';

@Injectable()
export class QuizService {
  private logger = new Logger(QuizService.name);

  constructor(
    @InjectRepository(Topic)
    private topicsRepository: Repository<Topic>,
    private helpers: QuizLogicService,
    private ai: QuizAiService,
  ) {}

  async generateQuiz(mode: StudyMode, topicIds: string[]) {
    const topics = await this.topicsRepository.find({
      where: { topicID: In(topicIds) },
      relations: ['class'],
    });

    if (!topics || topics.length === 0) {
      throw new NotFoundException('Topics not found in database.');
    }

    let combinedContent = '';
    let successCount = 0;
    
    for (const topic of topics) {
      try {
        const text = await this.helpers.getTopicContent(
          topic.class.classID.toString(), 
          topic.topicID
        );
        
        if (text && text.length > 50) {
            combinedContent += `\n\n--- CONTENT: ${topic.name} ---\n${text}`;
            successCount++;
        }
      } catch (e) {
        this.logger.warn(`Error downloading topic ${topic.topicID}: ${e.message}`);
      }
    }

    if (successCount === 0 || combinedContent.length < 100) {
        throw new BadRequestException('Failed to download files from S3 storage.');
    }

    // === QUIZ LOGIC ===
    if (mode === StudyMode.QUIZ) {
      const quizJson = await this.ai.generateQuizQuestions(combinedContent);
      return {
        mode: 'quiz',
        questions: quizJson.questions 
      };
    }
    
    // === FLASHCARDS LOGIC ===
    if (mode === StudyMode.CARDS) {
      const flashcardsJson = await this.ai.generateFlashcards(combinedContent);
      return {
        mode: 'cards',
        flashcards: flashcardsJson.flashcards 
      };
    }
    
    throw new BadRequestException(`Mode ${mode} is not supported yet.`);
  }
}