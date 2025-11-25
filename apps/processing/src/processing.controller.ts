import { Controller, Post, Body } from '@nestjs/common';
import { ProcessingService } from './processing.service';

@Controller('processing')
export class ProcessingController {
  constructor(private svc: ProcessingService) {}

  @Post('run')
  runProcessing(@Body() body: { userId: string; className: string }) {
    return this.svc.process(body.userId, body.className);
  }

  @Post('merge')
  async mergePdfs(@Body() body: { userId: string; className: string }) {
    return this.svc.mergeFinalPdfsS3(body.userId, body.className);
  }

  // NEW ENDPOINT
  @Post('split')
  async splitMerged(@Body() body: { userId: string; className: string }) {
    return this.svc.splitMergedPdf(body.userId, body.className);
  }
}