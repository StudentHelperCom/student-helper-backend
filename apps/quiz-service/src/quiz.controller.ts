import { Controller, Post, Body, Get } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { CreateQuizDto } from '@repo/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Quiz')
@Controller('quiz')
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Get('health')
  healthCheck() {
    return 'OK';
  }

  @Post('generate')
  @ApiOperation({ summary: 'Generate Quiz for chosen topics' })
  async generate(@Body() dto: CreateQuizDto) {
    return this.quizService.generateQuiz(dto.mode, dto.topicIds);
  }

  @Post('evaluate')
  @ApiOperation({ summary: 'Evaluate expanded answers' })
  async evaluate(@Body() body: { topicIds: string[], answers: any[] }) {
    return this.quizService.evaluateQuiz(body.topicIds, body.answers);
  }

  @Post('summarize')
  @ApiOperation({ summary: 'Generate structured summary for chosen topics' })
  async summarize(@Body() body: { topicIds: string[] }) {
    return this.quizService.generateSummary(body.topicIds);
  }
}