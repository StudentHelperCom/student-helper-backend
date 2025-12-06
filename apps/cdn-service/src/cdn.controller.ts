import { Controller, Post, Body, Get, Logger, BadRequestException } from '@nestjs/common';
import { CdnService } from './cdn.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
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
  healthCheck() { return 'OK'; }
  
  @Post('upload')
  @ApiOperation({ summary: 'Upload batch of files' })
  @ApiResponse({ status: 201, description: 'Files uploaded and processing started.' })
  @ApiBody({ type: [UploadFileDto] }) 
  async uploadFiles(@Body() data: UploadFileDto[]) {
    
    if (!data || data.length === 0) {
        throw new BadRequestException('No file data provided');
    }

    const results: any[] = [];
    const { userId } = data[0]; 

    for (const file of data) {
      const buffer = Buffer.from(file.content, 'base64');
      results.push(
        await this.cdnService.saveFile({
          filename: file.filename,
          content: buffer,
          userId: file.userId,
          className: file.className,
          examDate: file.examDate || '',       
          examLocation: file.examLocation || '' 
        })
      );
    }

    // --- CHANGE: Get classId from result and trigger processing ---
    // We assume all files in one batch belong to the same class
    const classId = results[0].classId;
    this.triggerProcessing(userId, classId); 

    return { 
        uploadStatus: 'success', 
        filesSaved: results.length,
        processingStarted: true,
        details: results 
    };
  }

  private async triggerProcessing(userId: string, classId: string) {
      const processingUrl = `${process.env.PROCESSING_URL!}/processing/start-workflow`;
      this.logger.log(`Triggering processing for Class ID: ${classId}`);

      try {
        await firstValueFrom(
            // --- CHANGE: Payload now sends classId instead of className
            this.httpService.post(processingUrl, { userId, classId }, {
                timeout: 300000 
            })
        );
        this.logger.log('Processing workflow completed successfully.');
      } catch (error) {
          this.logger.error(`Failed to trigger processing: ${error.message}`);
      }
  }
}