import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { StudyMode } from '@repo/common'; 
import { QuizAiService } from './quiz-ai.service';
import { QuizLogicService } from './quiz-logic.service';
import { TopicsRepository } from '@repo/database';

@Injectable()
export class QuizService {
  private logger = new Logger(QuizService.name);

  constructor(
    private readonly topicsRepo: TopicsRepository,
    private helpers: QuizLogicService,
    private ai: QuizAiService,
  ) {}

  private async fetchCombinedContent(topicIds: string[]): Promise<{ content: string, count: number }> {
    // 1. Fetch from DB using Repository
    const topics = await this.topicsRepo.findByIds(topicIds);

    if (!topics || topics.length === 0) {
      throw new NotFoundException('Topics not found in database.');
    }

    let combinedContent = '';
    let successCount = 0;

    // 2. Fetch content from S3 (using Logic Service)
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
    if (mode === StudyMode.QUIZ) { 
      const quizJson = await this.ai.generateQuizQuestions(content);
      return { mode: 'quiz', questions: quizJson.questions };
    }

    // === FLASHCARDS LOGIC ===
    if (mode === StudyMode.CARDS) {
      const flashcardsJson = await this.ai.generateFlashcards(content);
      return { mode: 'cards', flashcards: flashcardsJson.flashcards };
    }

    // === EXPANDED QUESTIONS LOGIC ===
    if (mode === StudyMode.EXPANDED) {
      const expandedJson = await this.ai.generateOpenQuestions(content, count);
      return { mode: 'expanded', questions: expandedJson.questions };
    }

    // === SUMMARY LOGIC ===
    if (mode === 'Summary' || mode === 'SUMMARY') {
        const summaryJson = await this.ai.generateStudySummary(content, count);
        return { mode: 'summary', summary: summaryJson.summary };
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