import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { StudyMode } from './dtos/create-quiz.dto';
import { Topic } from './entities/topic.entity';
import { QuizAi } from './helpers/quiz.ai';
import { QuizHelpers } from './helpers/quiz.helper';

@Injectable()
export class QuizService {
  private logger = new Logger(QuizService.name);

  constructor(
    @InjectRepository(Topic)
    private topicsRepository: Repository<Topic>,
    private helpers: QuizHelpers,
    private ai: QuizAi,
  ) {}

  async generateQuiz(mode: StudyMode, topicIds: string[]) {
    const topics = await this.topicsRepository.find({
      where: { id: In(topicIds) },
      select: ['id', 'topicName', 'classId'] 
    });

    if (!topics || topics.length === 0) {
      throw new NotFoundException('Topics not found in database.');
    }

    let combinedContent = '';
    let successCount = 0;
    
    for (const topic of topics) {
      try {
        const text = await this.helpers.getTopicContent(topic.classId, topic.id);
        
        if (text && text.length > 50) {
            combinedContent += `\n\n--- CONTENT: ${topic.topicName} ---\n${text}`;
            successCount++;
        }
      } catch (e) {
        this.logger.warn(`Error downloading topic ${topic.id}`);
      }
    }

    if (successCount === 0 || combinedContent.length < 100) {
        throw new BadRequestException('Failed to download files from S3 storage.');
    }

    // === 1. QUIZ LOGIC ===
    if (mode === StudyMode.QUIZ) {
      const quizJson = await this.ai.generateQuizQuestions(combinedContent);
      return {
        mode: 'quiz',
        questions: quizJson.questions 
      };
    }
    
    // === 2. FLASHCARDS LOGIC ===
    if (mode === StudyMode.CARDS) {
      const flashcardsJson = await this.ai.generateFlashcards(combinedContent);
      return {
        mode: 'cards',
        flashcards: flashcardsJson.flashcards 
      };
    }
    
    // If mode doesn't match, throw error instead of returning null
    throw new BadRequestException(`Mode ${mode} is not supported yet.`);
  }
}