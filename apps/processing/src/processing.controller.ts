import { Controller, Post, Body, Get, Logger, Param } from '@nestjs/common';
import { ProcessingService } from './processing.service';

@Controller('processing')
export class ProcessingController {
  private readonly logger = new Logger(ProcessingController.name);

  constructor(private svc: ProcessingService) {}

  @Get('health')
  healthCheck() { return 'OK'; }
  
  // ===========================================================================
  // MAIN ENDPOINT
  // ===========================================================================
  @Post('start-workflow') 
  async startWorkflow(@Body() body: { userId: string; classId: string }) {
    this.logger.log(`Received workflow request for Class ID: ${body.classId}`);
    return this.svc.executeFullWorkflow(body.classId);
  }

  // ===========================================================================
  // HELPER ENDPOINTS
  // ===========================================================================
  @Post('run')
  runProcessing(@Body() body: { classId: string }) {
    return this.svc.process(body.classId);
  }

  @Post('merge')
  async mergePdfs(@Body() body: { classId: string }) {
    return this.svc.mergeFinalContentS3(body.classId);
  }c

  @Post('split')
  async splitMerged(@Body() body: { classId: string }) {
    return this.svc.mergeFinalContentS3(body.classId);
  }

  @Get('status/:classId')
  async getStatus(@Param('classId') classId: string) {
    this.logger.log(`Checking status for Class ID: ${classId}`);
    return this.svc.checkStatus(classId);
  }
}