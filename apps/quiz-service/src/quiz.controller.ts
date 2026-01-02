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
  @ApiOperation({ summary: 'Generuj quiz na podstawie wybranych tematów' })
  async generate(@Body() dto: CreateQuizDto) {
    return this.quizService.generateQuiz(dto.mode, dto.topicIds);
  }
}