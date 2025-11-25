import { 
  Controller, 
  Post, 
  UseInterceptors,
  BadRequestException, 
  Body,
  UploadedFiles,
  UseGuards,
  Req,      
  Logger   
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags, ApiBearerAuth } from '@nestjs/swagger'; // <-- Import ApiBearerAuth
import { AuthDto } from './auth.dto';
import { JwtAuthGuard } from './common/jwt-auth.guard';


@ApiTags('CDN')
@ApiBearerAuth()
@Controller('cdn')
export class CdnController {
  private readonly logger = new Logger(CdnController.name);

  constructor(private readonly httpService: HttpService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FilesInterceptor('files', 10))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['className', 'files'], 
      properties: {
        className: { 
            type: 'string',
            description: 'The name of the class/category for the folder' 
        },
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

    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded');
    }

    if (!body.className) {
        throw new BadRequestException('Class name is required');
    }

    const payload = files.map(file => ({
      filename: file.originalname,
      content: file.buffer.toString('base64'),
      userId: user.userId,
      className: body.className 
    }));

    const cdnUrl = `${process.env.CDN_URL || 'http://localhost:3001'}/cdn/upload`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(cdnUrl, payload)
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Upload failed for User [${user.userId}]: ${error.message}`);
      throw new BadRequestException('Failed to upload files to CDN service');
    }
  }
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly httpService: HttpService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: AuthDto })
  async register(@Body() body: AuthDto) {
    const userServiceUrl = `${process.env.AUTH_URL || 'http://localhost:3002'}/auth/register`;

    const payload = {
      login: body.login,
      password: body.password
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(userServiceUrl, payload, {
          timeout: 5000,
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
    const userServiceUrl = `${process.env.AUTH_URL || 'http://localhost:3002'}/auth/login`;

    const payload = {
      login: body.login,
      password: body.password
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(userServiceUrl, payload, {
          timeout: 5000,
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

@ApiTags('Processing')
@ApiBearerAuth() // <-- Adds the lock icon in Swagger
@Controller('processing')
export class ProcessingController {
  private readonly logger = new Logger(ProcessingController.name);

  constructor(private readonly httpService: HttpService) {}

  @Post('run')
  @UseGuards(JwtAuthGuard) // <-- Protects route to get userId
  @ApiOperation({ summary: 'Process ALL PDF files within a class folder' }) // Updated summary
  @ApiBody({
    schema: {
      type: 'object',
      required: ['className'], // Removed filename requirement
      properties: {
        className: { type: 'string', example: 'History 101', description: 'Folder name containing files to process' }
      },
    }
  })
  async runProcessing(
    @Body() body: { className: string }, // Removed filename from DTO
    @Req() req
  ) {
    const user = req.user;

    if (!body.className) {
      throw new BadRequestException('className is required');
    }

    const processingUrl = `${process.env.PROCESSING_URL || 'http://localhost:3003'}/processing/run`;

    // Construct payload matching the NEW Microservice signature (userId + className only)
    const payload = {
      userId: user.userId,
      className: body.className
    };

    try {
      this.logger.log(`Requesting batch processing for User [${user.userId}], Class [${body.className}]`);
      
      const response = await firstValueFrom(
        this.httpService.post(processingUrl, payload, {
          timeout: 180000, // Increased timeout because batch processing takes longer
          headers: { 'Content-Type': 'application/json' }
        })
      );

      return response.data;

    } catch (error) {
      this.logger.error(`Processing service error: ${error.message}`);
      throw new BadRequestException(error.response?.data?.message || 'Failed to process documents');
    }
  }

  @Post('merge')
  @UseGuards(JwtAuthGuard) // <-- Protects route to get userId
  @ApiOperation({ summary: 'Merge all final PDFs in a class folder into one deduplicated PDF' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['className'],
      properties: {
        className: { type: 'string', example: 'History 101', description: 'Folder name to merge files from' }
      },
    }
  })
  async mergePdfs(
    @Body() body: { className: string },
    @Req() req
  ) {
    const user = req.user;

    if (!body.className) {
      throw new BadRequestException('className is required');
    }

    const processingUrl = `${process.env.PROCESSING_URL || 'http://localhost:3003'}/processing/merge`;

    // Construct payload matching the Microservice signature
    const payload = {
      userId: user.userId,
      className: body.className
    };

    try {
      this.logger.log(`Requesting merge for User [${user.userId}], Class [${body.className}]`);

      const response = await firstValueFrom(
        this.httpService.post(processingUrl, payload, {
          timeout: 120000,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      return response.data;

    } catch (error) {
      this.logger.error(`Merge service error: ${error.message}`);
      throw new BadRequestException(error.response?.data?.message || 'Failed to merge PDFs');
    }
  }
  @Post('split')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Split the final merged PDF into individual topic PDFs (t1.pdf, t2.pdf...)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['className'],
      properties: {
        className: { type: 'string', example: 'History 101', description: 'Folder name containing the merge' }
      },
    }
  })
  async splitMergedPdf(
    @Body() body: { className: string },
    @Req() req
  ) {
    const user = req.user;

    if (!body.className) {
      throw new BadRequestException('className is required');
    }

    const processingUrl = `${process.env.PROCESSING_URL || 'http://localhost:3003'}/processing/split`;

    const payload = {
      userId: user.userId,
      className: body.className
    };

    try {
      this.logger.log(`Requesting split for User [${user.userId}], Class [${body.className}]`);

      const response = await firstValueFrom(
        this.httpService.post(processingUrl, payload, {
          timeout: 120000, // 2 minutes timeout should be enough for splitting
          headers: { 'Content-Type': 'application/json' }
        })
      );

      return response.data;

    } catch (error) {
      this.logger.error(`Split service error: ${error.message}`);
      throw new BadRequestException(error.response?.data?.message || 'Failed to split PDF');
    }
  }
}