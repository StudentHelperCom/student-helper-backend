import { Controller, Post, Body, Get, Logger } from '@nestjs/common';
import { CdnService } from './cdn.service';
import { HttpService } from '@nestjs/axios'; // <--- Import
import { firstValueFrom } from 'rxjs';       // <--- Import

@Controller('cdn')
export class CdnController {
  private readonly logger = new Logger(CdnController.name);

  constructor(
    private readonly cdnService: CdnService,
    private readonly httpService: HttpService // <--- Inject HttpService
  ) {}

  @Get('health')
  healthCheck() { return 'OK'; }
  
  @Post('upload')
  async uploadFiles(@Body() data: { filename: string; content: string; userId: string; className: string }[]) {
    const results: any[] = [];
    
    if (!data || data.length === 0) return [];

    // 1. Capture details from the first file (assuming all files in batch belong to same user/class)
    const { userId, className } = data[0];

    // 2. Save all files to S3
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

    // 3. Trigger Processing Service IMMEDIATELY
    // We use setImmediate or simply don't await if we don't want the user to wait for processing
    // However, if you want to return the processing status, use await.
    
    this.triggerProcessing(userId, className); // <--- Running in background (Fire and Forget)

    return { 
        uploadStatus: 'success', 
        filesSaved: results.length,
        processingStarted: true 
    };
  }

  // Helper to call the other Microservicex
  private async triggerProcessing(userId: string, className: string) {
      const processingUrl = `${process.env.PROCESSING_URL!}/processing/start-workflow`;
      
      this.logger.log(`Triggering processing for Class: ${className}, User: ${userId}`);

      try {
        // We use the new MASTER endpoint that does Run->Merge->Split
        await firstValueFrom(
            this.httpService.post(processingUrl, { userId, className }, {
                timeout: 300000 // 5 minutes timeout (adjust as needed)
            })
        );
        this.logger.log('Processing workflow completed successfully.');
      } catch (error) {
          this.logger.error(`Failed to trigger processing: ${error.message}`);
      }
  }
}