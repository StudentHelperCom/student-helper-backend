import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Topic } from '@repo/database';
import { StudyMode } from '@repo/common'; // <--- Import the Enum here
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

  // ... fetchCombinedContent method remains the same ...
  private async fetchCombinedContent(topicIds: string[]): Promise<{ content: string, count: number }> {
    // (Your existing code here is fine)
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
      } catch (e: any) {
        this.logger.warn(`Error downloading topic ${topic.topicID}: ${e.message}`);
      }
    }

    if (successCount === 0 || combinedContent.length < 100) {
      throw new BadRequestException('Failed to download files from S3 storage.');
    }

    return { content: combinedContent, count: successCount };
  }

  async generateQuiz(mode: string, topicIds: string[]) {
    const { content, count } = await this.fetchCombinedContent(topicIds);

    // === QUIZ LOGIC ===
    // Use the Enum to match 'Quiz' exactly
    if (mode === StudyMode.QUIZ) { 
      const quizJson = await this.ai.generateQuizQuestions(content);
      return { mode: 'quiz', questions: quizJson.questions };
    }

    // === FLASHCARDS LOGIC ===
    // Use the Enum to match 'Cards' exactly
    if (mode === StudyMode.CARDS) {
      const flashcardsJson = await this.ai.generateFlashcards(content);
      return { mode: 'cards', flashcards: flashcardsJson.flashcards };
    }

    // === EXPANDED QUESTIONS LOGIC ===
    // Use the Enum to match 'Expanded' exactly
    if (mode === StudyMode.EXPANDED) {
      const expandedJson = await this.ai.generateOpenQuestions(content, count);
      return { mode: 'expanded', questions: expandedJson.questions };
    }

    throw new BadRequestException(`Mode ${mode} is not supported yet.`);
  }

  async generateSummary(topicIds: string[]) {
    const { content, count } = await this.fetchCombinedContent(topicIds);
    const summaryJson = await this.ai.generateStudySummary(content, count);
    
    return {
      mode: 'summary',
      summary: summaryJson.summary
    };
  }

  async evaluateQuiz(topicIds: string[], answers: any[]) {
    const { content } = await this.fetchCombinedContent(topicIds);
    const evaluationJson = await this.ai.evaluateOpenAnswers(content, answers);
    
    return {
      status: 'evaluated',
      results: evaluationJson.results
    };
  }
}