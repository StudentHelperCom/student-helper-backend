import { Controller, Post, Body, Get, Logger, BadRequestException } from '@nestjs/common';
import { CdnService } from './cdn.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
// Make sure this path matches where you created the file
import { UploadFileDto } from './dtos/upload-file.dto'; 

@ApiTags('CDN')
@Controller('cdn')
export class CdnController {
  private readonly logger = new Logger(CdnController.name);

  constructor(
    private readonly cdnService: CdnService,
    private readonly httpService: HttpService
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  healthCheck() { 
    return 'OK'; 
  }
  
  @Post('upload')
  @ApiOperation({ summary: 'Upload batch of files' })
  @ApiResponse({ status: 201, description: 'Files uploaded and processing started.' })
  @ApiBody({ type: [UploadFileDto] }) // Explicitly tells Swagger this is an Array of Objects
  async uploadFiles(@Body() data: UploadFileDto[]) {
    
    if (!data || data.length === 0) {
        throw new BadRequestException('No file data provided');
    }

    const results: any[] = [];

    // 1. Capture details from the first file to identify the batch
    const { userId, className } = data[0];

    // 2. Save all files to S3 AND Database
    for (const file of data) {
      // Decode base64 content
      const buffer = Buffer.from(file.content, 'base64');
      
      results.push(
        await this.cdnService.saveFile({
          filename: file.filename,
          content: buffer,
          userId: file.userId,
          className: file.className,
          examDate: file.examDate ?? '', 
          examLocation: file.examLocation ?? '' 
        })
      );
    }

    // 3. Trigger Processing Service (Background Task)
    // We do not await this because we don't want to block the response
    this.triggerProcessing(userId, className); 

    return { 
        uploadStatus: 'success', 
        filesSaved: results.length,
        processingStarted: true,
        details: results 
    };
  }

  // --- HELPER METHODS ---

  private async triggerProcessing(userId: string, className: string) {
      const processingUrl = `${process.env.PROCESSING_URL!}/processing/start-workflow`;
      this.logger.log(`Triggering processing for Class: ${className}, User: ${userId}`);

      try {
        // We use firstValueFrom to convert the Observable to a Promise
        await firstValueFrom(
            this.httpService.post(processingUrl, { userId, className }, {
                timeout: 300000 // 5 minutes timeout
            })
        );
        this.logger.log('Processing workflow completed successfully.');
      } catch (error) {
          this.logger.error(`Failed to trigger processing: ${error.message}`);
          // Note: We swallow the error here so the User still sees "uploadStatus: success"
          // You might want to implement a retry mechanism or alert system here.
      }
  }
}