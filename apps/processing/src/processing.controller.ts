import { Controller, Post, Body } from '@nestjs/common';
import { ProcessingService } from './processing.service';

@Controller('processing')
export class ProcessingController {
  constructor(private svc: ProcessingService) {}

  @Post('run')
  runProcessing(@Body() body: { userId: string; className: string; filename: string }) {
    // Now passes all required parameters to target: userId/className/uploads/filename
    return this.svc.process(body.userId, body.className);
  }

  @Post('merge')
  async mergePdfs(@Body() body: { userId: string; className: string }) {
    // Merges all PDFs found in: userId/className/final/
    return this.svc.mergeFinalPdfsS3(body.userId, body.className);
  }
}