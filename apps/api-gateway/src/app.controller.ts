import { 
  Controller, 
  Post, 
  UploadedFile, 
  UseInterceptors,
  BadRequestException 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';

@ApiTags('CDN')
@Controller('cdn')
export class AppController {
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

    // Fixed: Use the correct CDN endpoint
    const cdnUrl = `${process.env.CDN_URL || 'http://localhost:3000'}/cdn/upload`;
    
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