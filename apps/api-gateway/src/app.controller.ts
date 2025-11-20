import { 
  Controller, 
  Post, 
  UploadedFile, 
  UseInterceptors,
  BadRequestException, 
  Body
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthDto } from './auth.dto';

@ApiTags('CDN')
@Controller('cdn')
export class CdnController {
  constructor(private readonly httpService: HttpService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const payload = {
      filename: file.originalname,
      content: file.buffer.toString('base64'),
    };

    const cdnUrl = `${process.env.CDN_URL || 'http://localhost:3001'}/cdn/upload`;
    
    try {
      const response = await firstValueFrom(
        this.httpService.post(cdnUrl, payload)
      );
      return response.data;
    } catch (error) {
      console.error('Error forwarding to CDN:', error.message);
      throw new BadRequestException('Failed to upload file to CDN');
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
@Controller('processing')
export class ProcessingController {
  constructor(private readonly httpService: HttpService) {}

  @Post('run')
  @ApiOperation({ summary: 'Process PDF + TXT to generate a structured final PDF' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        baseName: { type: 'string', example: 'document123' }
      },
      required: ['baseName']
    }
  })
  async runProcessing(@Body() body: { baseName: string }) {
    if (!body?.baseName) {
      throw new BadRequestException('baseName is required');
    }

    const processingUrl = `${process.env.PROCESSING_URL || 'http://localhost:3003'}/processing/run`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(processingUrl, { baseName: body.baseName }, {
          timeout: 120000,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      return response.data;

    } catch (error) {
      console.error('Processing service error:', error.response?.data || error.message);
      throw new BadRequestException('Failed to process document');
    }
  }
  @Post('merge')
  @ApiOperation({ summary: 'Merge all final PDFs into one deduplicated PDF' })
  async mergePdfs() {
    const processingUrl = `${process.env.PROCESSING_URL || 'http://localhost:3003'}/processing/merge`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(processingUrl, {}, {
          timeout: 120000,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      return response.data;

    } catch (error) {
      console.error('Merge service error:', error.response?.data || error.message);
      throw new BadRequestException('Failed to merge PDFs');
    }
  }
}