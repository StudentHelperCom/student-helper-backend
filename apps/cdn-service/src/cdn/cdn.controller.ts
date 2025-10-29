import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { CdnService } from './cdn.service';

@Controller()
export class CdnController {
  constructor(private readonly cdnService: CdnService) {}

  @MessagePattern('upload_file')
  async handleUpload(data: { filename: string; content: string }) {
    const buffer = Buffer.from(data.content, 'base64');
    return this.cdnService.saveFile({ filename: data.filename, content: buffer });
}

}