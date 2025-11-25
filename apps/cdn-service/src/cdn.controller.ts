import { Controller, Post, Body } from '@nestjs/common';
import { CdnService } from './cdn.service';

@Controller('cdn')
export class CdnController {
  constructor(private readonly cdnService: CdnService) {}

  @Post('upload')
  async uploadFiles(@Body() data: { filename: string; content: string; userId: string; className: string }[]) {
    const results: any[] = [];

    for (const file of data) {
      const buffer = Buffer.from(file.content, 'base64');
      
      results.push(
        await this.cdnService.saveFile({
          filename: file.filename,
          content: buffer,
          userId: file.userId,
          className: file.className
        })
      );
    }

    return results;
  }
}