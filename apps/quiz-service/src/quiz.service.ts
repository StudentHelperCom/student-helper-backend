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
    if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
        this.logger.warn('fetchCombinedContent called with empty or invalid topicIds');
        throw new BadRequestException('No topic IDs provided for content generation.');
    }

    // 1. Fetch from DB
    const topics = await this.topicsRepo.findByIds(topicIds);

    if (!topics || topics.length === 0) {
      throw new NotFoundException('Topics not found in database.');
    }
    
    const downloadPromises = topics.map(async (topic) => {
        try {
            const text = await this.helpers.getTopicContent(
                topic.class.classID.toString(),
                topic.topicID
            );
            
            if (text && text.length > 50) {
                return `\n\n--- CONTENT: ${topic.name} ---\n${text}`;
            }
            return null;
        } catch (e: any) {
            this.logger.warn(`Error downloading topic ${topic.topicID}: ${e.message}`);
            return null;
        }
    });

    const results = await Promise.all(downloadPromises);
    
    const validContents = results.filter((c): c is string => c !== null);
    const combinedContent = validContents.join('');

    if (validContents.length === 0 || combinedContent.length < 100) {
      throw new BadRequestException('Failed to download valid content files from S3 storage.');
    }

    return { content: combinedContent, count: validContents.length };
  }

  async generateQuiz(mode: string, topicIds: string[]) {
    const { content, count } = await this.fetchCombinedContent(topicIds);

    if (mode === StudyMode.QUIZ) { 
      const quizJson = await this.ai.generateQuizQuestions(content);
      return { mode: 'quiz', questions: quizJson.questions };
    }
    if (mode === StudyMode.CARDS) {
      const flashcardsJson = await this.ai.generateFlashcards(content);
      return { mode: 'cards', flashcards: flashcardsJson.flashcards };
    }
    if (mode === StudyMode.EXPANDED) {
      const expandedJson = await this.ai.generateOpenQuestions(content, count);
      return { mode: 'expanded', questions: expandedJson.questions };
    }
    if (mode === StudyMode.SUMMARY) {
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