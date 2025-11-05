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
    // Add /api prefix to match your auth service configuration
    const userServiceUrl = `${process.env.USERS_URL || 'http://localhost:3002'}/api/auth/register`;

    const payload = {
      login: body.login,
      password: body.password
    };

    console.log('🔍 [Gateway] Sending request to:', userServiceUrl);
    console.log('🔍 [Gateway] Payload:', payload);

    try {
      const response = await firstValueFrom(
        this.httpService.post(userServiceUrl, payload, {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json',
          }
        }),
      );
      console.log('✅ [Gateway] Success response:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ [Gateway] Full error details:', {
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
    // Add /api prefix here too
    const userServiceUrl = `${process.env.USERS_URL || 'http://localhost:3002'}/api/auth/login`;

    const payload = {
      login: body.login,
      password: body.password
    };

    console.log('🔍 [Gateway] Sending request to:', userServiceUrl);

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
      console.error('❌ [Gateway] Login error:', error.response?.data || error.message);
      throw new BadRequestException('Failed to log in');
    }
}
}