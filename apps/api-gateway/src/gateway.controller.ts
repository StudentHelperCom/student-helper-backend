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
  Get
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger'; 
import { AuthDto } from './auth.dto';
import { JwtAuthGuard } from './common/jwt-auth.guard';

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


