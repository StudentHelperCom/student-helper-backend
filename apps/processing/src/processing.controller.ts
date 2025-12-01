import { Controller, Post, Body, Get } from '@nestjs/common';
import { ProcessingService } from './processing.service';

@Controller('processing')
export class ProcessingController {
  constructor(private svc: ProcessingService) {}

  @Get('health')
  healthCheck() {
    return 'OK';
  }
  
  @Post('start-workflow')
  async startWorkflow(@Body() body: { userId: string; className: string }) {
    // This runs all 3 steps sequentially internally
    return this.svc.executeFullWorkflow(body.userId, body.className);
  }

  @Post('run')
  runProcessing(@Body() body: { userId: string; className: string }) {
    return this.svc.process(body.userId, body.className);
  }

  @Post('merge')
  async mergePdfs(@Body() body: { userId: string; className: string }) {
    return this.svc.mergeFinalPdfsS3(body.userId, body.className);
  }

  @Post('split')
  async splitMerged(@Body() body: { userId: string; className: string }) {
    return this.svc.splitMergedPdf(body.userId, body.className);
  }
}