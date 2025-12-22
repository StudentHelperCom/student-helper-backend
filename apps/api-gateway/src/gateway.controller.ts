import { 
  Controller, 
  Post, 
  UseInterceptors,
  BadRequestException, 
  Body,
  UploadedFiles,
  UseGuards,
  Req,      
  Logger,   
  Get,
  Param,
  ForbiddenException
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger'; 
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { AuthDto } from '@repo/database';

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
  @ApiOperation({ summary: 'Health check' })
  healthCheck() { return 'OK'; }

  @Post('create-class')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create a Class entry in DB' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['className'],
      properties: {
        className: { type: 'string', example: 'Mathematics 101' },
        examDate: { type: 'string', format: 'date-time', example: '2025-06-15T09:00:00' },
        examLocation: { type: 'string', example: 'Room 304' }
      }
    }
  })
  async createClass(@Body() body: { className: string; examDate?: string; examLocation?: string }, @Req() req) {
      const user = req.user;
      const cdnUrl = `${process.env.CDN_URL!}/cdn/create-class`;

      const payload = {
          userId: user.userId,
          className: body.className,
          examDate: body.examDate,
          examLocation: body.examLocation
      };

      try {
        const response = await firstValueFrom(this.httpService.post(cdnUrl, payload));
        return response.data;
      } catch (error) {
        throw new BadRequestException(error.response?.data?.message || 'Failed to create class');
      }
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
        className: { type: 'string', description: 'The name of the class' },
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[], 
    @Body() body: { className: string }, 
    @Req() req
  ) {
    const user = req.user;

    if (!files || files.length === 0) throw new BadRequestException('No files uploaded');
    if (!body.className) throw new BadRequestException('Class name is required');

    const payload = files.map(file => ({
      filename: file.originalname,
      content: file.buffer.toString('base64'),
      userId: user.userId,
      className: body.className,
    }));

    const cdnUrl = `${process.env.CDN_URL!}/cdn/upload`;

    try {
      const response = await firstValueFrom(this.httpService.post(cdnUrl, payload));
      return response.data;
    } catch (error) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new BadRequestException(error.response?.data?.message || 'Upload failed');
    }
  }

  @Get('classes')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get list of all classes for the current user' })
  async getClasses(@Req() req) {
    const user = req.user;
    const cdnUrl = `${process.env.CDN_URL!}/cdn/user/${user.userId}`;

    try {
      const response = await firstValueFrom(this.httpService.get(cdnUrl));
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to fetch classes: ${error.message}`);
      throw new BadRequestException(error.response?.data?.message || 'Failed to fetch classes');
    }
  }
  
  @Get('class/:classId/topics')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all generated topics for a specific class' })
  async getTopicsForClass(@Param('classId') classId: string, @Req() req) {
    const user = req.user;
    const cdnUrl = `${process.env.CDN_URL!}/cdn/class/${classId}/topics?userId=${user.userId}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(cdnUrl)
      );
      return response.data;
    } catch (error) {
      if (error.response?.status === 403) {
          throw new ForbiddenException(error.response.data.message);
      }
      throw new BadRequestException(error.response?.data?.message || 'Failed to fetch topics');
    }
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
  @ApiOperation({ summary: 'Health check' })
  healthCheck() { return 'OK'; }

  @Post('run')
  @UseGuards(JwtAuthGuard) 
  @ApiOperation({ summary: 'Manually trigger processing for the chosen class' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['classId'], 
      properties: {
        classId: { type: 'string', example: 'uuid-1234-5678', description: 'The UUID of the class returned by upload' }
      },
    }
  })
  async runProcessing(@Body() body: { classId: string }, @Req() req) {
    if (!body.classId) throw new BadRequestException('classId is required');

    const processingUrl = `${process.env.PROCESSING_URL!}/processing/run`;
    
    const payload = { classId: body.classId };

    try {
      this.logger.log(`Requesting batch processing for Class ID [${body.classId}]`);
      const response = await firstValueFrom(
        this.httpService.post(processingUrl, payload, {
          timeout: 600000,
          headers: { 'Content-Type': 'application/json' }
        })
      );
      return response.data;
    } catch (error) {
      throw new BadRequestException(error.response?.data?.message || 'Processing failed');
    }
  }

  @Post('merge')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Merge PDFs for a Class ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['classId'],
      properties: {
        classId: { type: 'string', example: 'uuid-1234-5678' }
      },
    }
  })
  async mergePdfs(@Body() body: { classId: string }, @Req() req) {
    if (!body.classId) throw new BadRequestException('classId is required');

    const processingUrl = `${process.env.PROCESSING_URL!}/processing/merge`;
    const payload = { classId: body.classId };

    try {
      const response = await firstValueFrom(
        this.httpService.post(processingUrl, payload, {
          timeout: 600000,
          headers: { 'Content-Type': 'application/json' }
        })
      );
      return response.data;
    } catch (error) {
      throw new BadRequestException(error.response?.data?.message || 'Merge failed');
    }
  }

  @Post('split')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Split merged PDF for a Class ID' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['classId'],
      properties: {
        classId: { type: 'string', example: 'uuid-1234-5678' }
      },
    }
  })
  async splitMergedPdf(@Body() body: { classId: string }, @Req() req) {
    if (!body.classId) throw new BadRequestException('classId is required');

    const processingUrl = `${process.env.PROCESSING_URL!}/processing/split`;
    const payload = { classId: body.classId };

    try {
      const response = await firstValueFrom(
        this.httpService.post(processingUrl, payload, {
          timeout: 600000,
          headers: { 'Content-Type': 'application/json' }
        })
      );
      return response.data;
    } catch (error) {
      throw new BadRequestException(error.response?.data?.message || 'Split failed');
    }
  }
}

// =========================================================================
// === QUIZ CONTROLLER (NEW) ===
// =========================================================================
@ApiTags('Quiz')
@ApiBearerAuth()
@Controller('quiz')
export class QuizController {
  private readonly logger = new Logger(QuizController.name);

  constructor(private readonly httpService: HttpService) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  healthCheck() { return 'OK'; }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Generate quiz questions based on selected topics' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['mode', 'topicIds'],
      properties: {
        mode: { 
          type: 'string', 
          enum: ['Quiz', 'Expanded', 'Cards', 'Study'], 
          example: 'Quiz',
          description: 'Study mode'
        },
        topicIds: { 
          type: 'array', 
          items: { type: 'string' },
          example: ['uuid-topic-1', 'uuid-topic-2'],
          description: 'Array of Topic UUIDs from the database'
        }
      }
    }
  })
  async generateQuiz(@Body() body: { mode: string; topicIds: string[] }, @Req() req) {
    if (!body.topicIds || body.topicIds.length === 0) {
      throw new BadRequestException('At least one topicId is required');
    }

    const quizServiceUrl = `${process.env.QUIZ_SERVICE_URL!}/quiz/generate`;

    const payload = {
      mode: body.mode,
      topicIds: body.topicIds
    };

    try {
      this.logger.log(`Requesting quiz generation [Mode: ${body.mode}] for ${body.topicIds.length} topics`);
      
      const response = await firstValueFrom(
        this.httpService.post(quizServiceUrl, payload, {
          timeout: 60000, // 60s timeout for AI generation
          headers: { 'Content-Type': 'application/json' }
        })
      );
      return response.data;

    } catch (error) {
      this.logger.error(`Quiz generation failed: ${error.message}`);
      throw new BadRequestException(error.response?.data?.message || 'Failed to generate quiz');
    }
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
  @ApiOperation({ summary: 'Health check' })
  healthCheck() {
    return 'OK';
  }

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: AuthDto })
  async register(@Body() body: AuthDto) {
    const userServiceUrl = `${process.env.AUTH_URL!}/auth/register`;

    const payload = {
      login: body.login,
      password: body.password
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(userServiceUrl, payload, {
          timeout: 600000,
          headers: {
            'Content-Type': 'application/json',
          }
        }),
      );
      return response.data;
    } catch (error) {
      console.error('Full error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: userServiceUrl,
      });
      throw new BadRequestException('Failed to register user');
    }
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({ type: AuthDto })
  async login(@Body() body: AuthDto) {
    const userServiceUrl = `${process.env.AUTH_URL!}/auth/login`;

    const payload = {
      login: body.login,
      password: body.password
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(userServiceUrl, payload, {
          timeout: 600000,
          headers: {
            'Content-Type': 'application/json',
          }
        }),
      );
      return response.data;
    } catch (error) {
        console.error('Login error:', error.response?.data || error.message);
        throw new BadRequestException('Failed to log in');
      }
  }
}