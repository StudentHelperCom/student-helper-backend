import { 
  Controller, 
  Post, 
  UseInterceptors,
  Body,
  UploadedFiles,
  UseGuards,
  Req,      
  Logger,   
  Get,
  Param,
  Delete,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger'; 
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { AuthDto, CreateClassDto } from '@repo/common';

// =========================================================================
// === HEALTHCHECK ===
// =========================================================================
@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Gateway application health check' })
  healthCheck() {
    return 'OK';
  }
}

// =========================================================================
// === CDN CONTROLLER ===
// =========================================================================
@ApiTags('CDN')
@ApiBearerAuth()
@Controller('cdn')
export class CdnController {
  private readonly logger = new Logger(CdnController.name);

  constructor(private readonly httpService: HttpService) {}

  @Get('health')
  healthCheck() { return 'OK'; }

  @Post('create-class')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a Class entry in DB' })
  async createClass(@Body() body: CreateClassDto, @Req() req) {
      const user = req.user;
      const cdnUrl = `${process.env.CDN_URL!}/cdn/create-class`;

      const response = await firstValueFrom(
        this.httpService.post(cdnUrl, {
          ...body,             
          userId: user.userId, 
        })
      );
      return response.data;
  }
  
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiOperation({ summary: 'Upload files to Class' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['className', 'files'], 
      properties: {
        className: { type: 'string' },
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[], 
    @Body() body: { className: string }, 
    @Req() req
  ) {
    const user = req.user;
    const cdnUrl = `${process.env.CDN_URL!}/cdn/upload`;

    const payload = files.map(file => ({
      filename: file.originalname,
      content: file.buffer.toString('base64'),
      userId: user.userId,
      className: body.className,
    }));

    const response = await firstValueFrom(this.httpService.post(cdnUrl, payload));
    return response.data;
  }

  @Get('classes')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get list of all classes for the current user' })
  async getClasses(@Req() req) {
    const user = req.user;
    const cdnUrl = `${process.env.CDN_URL!}/cdn/user/${user.userId}`;
    const response = await firstValueFrom(this.httpService.get(cdnUrl));
    return response.data;
  }
  
  @Get('class/:classId/topics')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all generated topics for a specific class' })
  async getTopicsForClass(@Param('classId') classId: string, @Req() req) {
    const user = req.user;
    const cdnUrl = `${process.env.CDN_URL!}/cdn/class/${classId}/topics?userId=${user.userId}`;
    const response = await firstValueFrom(this.httpService.get(cdnUrl));
    return response.data;
  }

  @Get('class/:classId/files')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all source files uploaded for a specific class' })
  async getClassFiles(@Param('classId') classId: string, @Req() req) {
    const user = req.user;
    const cdnUrl = `${process.env.CDN_URL!}/cdn/class/${classId}/files?userId=${user.userId}`;
    const response = await firstValueFrom(this.httpService.get(cdnUrl));
    return response.data;
  }

  @Delete('class/:classId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a class permanently' })
  async deleteClass(@Param('classId') classId: string, @Req() req) {
    const user = req.user;
    const cdnUrl = `${process.env.CDN_URL!}/cdn/class/${classId}?userId=${user.userId}`;
    const response = await firstValueFrom(
      this.httpService.delete(cdnUrl)
    );
    return response.data;
  }
}

// =========================================================================
// === PROCESSING CONTROLLER ===
// =========================================================================
@ApiTags('Processing')
@ApiBearerAuth()
@Controller('processing')
export class ProcessingController {
  private readonly logger = new Logger(ProcessingController.name);

  constructor(private readonly httpService: HttpService) {}

  @Get('health')
  healthCheck() { return 'OK'; }

  @Post('run')
  @UseGuards(JwtAuthGuard) 
  @ApiOperation({ summary: 'Manually trigger processing for the chosen class' })
  @ApiBody({ schema: { type: 'object', properties: { classId: { type: 'string' } } } })
  async runProcessing(@Body() body: { classId: string }) {
    const processingUrl = `${process.env.PROCESSING_URL!}/processing/run`;
    
    const response = await firstValueFrom(
      this.httpService.post(processingUrl, { classId: body.classId })
    );
    return response.data;
  }

  @Post('merge')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Merge PDFs for a Class ID' })
  @ApiBody({ schema: { type: 'object', properties: { classId: { type: 'string' } } } })
  async mergePdfs(@Body() body: { classId: string }) {
    const processingUrl = `${process.env.PROCESSING_URL!}/processing/merge`;

    const response = await firstValueFrom(
      this.httpService.post(processingUrl, { classId: body.classId })
    );
    return response.data;
  }

  @Post('split')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Split merged PDF for a Class ID' })
  @ApiBody({ schema: { type: 'object', properties: { classId: { type: 'string' } } } })
  async splitMergedPdf(@Body() body: { classId: string }) {
    const processingUrl = `${process.env.PROCESSING_URL!}/processing/split`;

    const response = await firstValueFrom(
      this.httpService.post(processingUrl, { classId: body.classId })
    );
    return response.data;
  }

  @Get('status/:classId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Check if processing workflow is complete' })
  async getStatus(@Param('classId') classId: string) {
    const processingUrl = `${process.env.PROCESSING_URL!}/processing/status/${classId}`;
    
    const response = await firstValueFrom(
      this.httpService.get(processingUrl)
    );
    return response.data;
  }
}

// =========================================================================
// === QUIZ CONTROLLER ===
// =========================================================================
@ApiTags('Quiz')
@ApiBearerAuth()
@Controller('quiz')
export class QuizController {
  private readonly logger = new Logger(QuizController.name);

  constructor(private readonly httpService: HttpService) {}

  @Get('health')
  healthCheck() { return 'OK'; }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate study content (Quiz, Cards, Expanded, Summary)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mode', 'topicIds'],
      properties: {
        mode: { 
          type: 'string', 
          enum: ['Quiz', 'Expanded', 'Cards', 'Summary'], 
          example: 'Quiz'
        },
        topicIds: { 
          type: 'array', 
          items: { type: 'string' },
          example: ['uuid-topic-1']
        }
      }
    }
  })
  async generateQuiz(@Body() body: { mode: string; topicIds: string[] }) {
    const quizServiceUrl = `${process.env.QUIZ_SERVICE_URL!}/quiz/generate`;

    // Increased timeout for AI generation
    const response = await firstValueFrom(
      this.httpService.post(quizServiceUrl, body, { timeout: 60000 }) 
    );
    return response.data;
  }

  @Post('evaluate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Evaluate open-ended answers via AI' })
  async evaluateQuiz(@Body() body: { topicIds: string[]; answers: any[] }) {
    const quizServiceUrl = `${process.env.QUIZ_SERVICE_URL!}/quiz/evaluate`;

    const response = await firstValueFrom(
      this.httpService.post(quizServiceUrl, body, { timeout: 60000 })
    );
    return response.data;
  }
}

// =========================================================================
// === AUTH CONTROLLER ===
// =========================================================================
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly httpService: HttpService) {}

  @Get('health')
  healthCheck() { return 'OK'; }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: AuthDto })
  async register(@Body() body: AuthDto) {
    const userServiceUrl = `${process.env.AUTH_URL!}/auth/register`;

    const response = await firstValueFrom(
      this.httpService.post(userServiceUrl, body)
    );
    return response.data;
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({ type: AuthDto })
  async login(@Body() body: AuthDto) {
    const userServiceUrl = `${process.env.AUTH_URL!}/auth/login`;

    const response = await firstValueFrom(
      this.httpService.post(userServiceUrl, body)
    );
    return response.data;
  }
}