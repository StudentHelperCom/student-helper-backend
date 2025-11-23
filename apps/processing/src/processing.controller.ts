import { Controller, Post, Body } from '@nestjs/common';
import { ProcessingService } from './processing.service';

@Controller('processing')
export class ProcessingController {
  constructor(private svc: ProcessingService) {}

  @Post('run')
  runProcessing(@Body() body: { baseName: string }) {
    return this.svc.process(body.baseName);
  }

  @Post('merge')
  async mergePdfs() {
    return this.svc.mergeFinalPdfsS3();
  }
}