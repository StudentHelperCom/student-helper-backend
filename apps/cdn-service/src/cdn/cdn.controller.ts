import { Controller, Post, Body } from '@nestjs/common';
import { CdnService } from './cdn.service';

@Controller('cdn')
export class CdnController {
  constructor(private readonly cdnService: CdnService) {}

  @Post('upload')
  async uploadFile(@Body() data: { filename: string; content: string }) {
    // Convert the base64 file content back to binary
    const buffer = Buffer.from(data.content, 'base64');
    
    // Use your existing logic to save the file
    return this.cdnService.saveFile({
      filename: data.filename,
      content: buffer,
    });
  }
}
