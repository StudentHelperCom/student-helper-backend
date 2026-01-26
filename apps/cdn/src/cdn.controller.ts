import { Controller, Post, Body, Get, Logger, BadRequestException, Param, Query, Delete } from '@nestjs/common';
import { CdnService } from './cdn.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ApiBody, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UploadFileDto } from '@repo/common';
import { CreateClassDto } from '@repo/common';

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

  // ===========================================================================
  // MAIN ENDPOINTS
  // ===========================================================================

  @Post('test-upload')
  @ApiOperation({ summary: 'Upload batch of files ONLY (No processing triggered)' })
  @ApiResponse({ status: 201, description: 'Files uploaded successfully.' })
  @ApiBody({ type: [UploadFileDto] }) 
  async uploadFilesOnly(@Body() data: UploadFileDto[]) {
    return this.handleUploadFlow(data, false);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload batch of files AND Trigger Processing' })
  @ApiResponse({ status: 201, description: 'Files uploaded and processing started.' })
  @ApiBody({ type: [UploadFileDto] }) 
  async uploadAndProcess(@Body() data: UploadFileDto[]) {
    return this.handleUploadFlow(data, true);
  }
  
  private async handleUploadFlow(data: UploadFileDto[], shouldProcess: boolean) {
    if (!data || data.length === 0) {
        throw new BadRequestException('No file data provided');
    }

    const { userId, className } = data[0]!; 
    const results: any[] = [];

    // 1. PREPARE ENVIRONMENT ONCE (Cleans S3, Creates Class)
    const classId = await this.cdnService.prepareUploadEnvironment(userId, className);

    // 2. SAVE ALL FILES (Using the classId we just prepared)
    for (const file of data) {
      const buffer = Buffer.from(file.content, 'base64');
      results.push(
        await this.cdnService.saveFile({
          filename: file.filename,
          content: buffer,
          classId: classId, // Pass the ID directly
        })
      );
    }

    // 3. CONDITIONAL PROCESSING TRIGGER
    if (shouldProcess) {
        this.triggerProcessing(userId, classId);
    }

    return { 
        uploadStatus: 'success', 
        filesSaved: results.length,
        processingStarted: shouldProcess,
        details: results 
    };
  }

  private async triggerProcessing(userId: string, classId: string) {
      const processingUrl = `${process.env.PROCESSING_URL!}/processing/start-workflow`;
      this.logger.log(`Triggering processing for Class ID: ${classId}`);
      try {
        await firstValueFrom(
            this.httpService.post(processingUrl, { userId, classId }, {
                timeout: 600000 
            })
        );
        this.logger.log('Processing workflow completed successfully.');
      } catch (error: any) {
          this.logger.error(`Failed to trigger processing: ${error.message}`);
      }
  }

  // ===========================================================================
  // HELPER ENDPOINTS
  // ===========================================================================

  @Post('create-class')
  @ApiOperation({ summary: 'Create or Update a class' })
  async createClass(@Body() body: CreateClassDto & { userId: string }) {
      const { userId, ...dto } = body;
      this.logger.log(`Received CreateClass Request for User: ${userId}`); 
      return this.cdnService.createClass(userId, dto as CreateClassDto);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all classes belonging to a specific user' })
  async getUserClasses(@Param('userId') userId: string) {
      return this.cdnService.getClassesForUser(userId);
  }

  @Get('class/:classId/topics')
  @ApiOperation({ summary: 'Get topics for a class' })
  async getTopics(
    @Param('classId') classId: string,
    @Query('userId') userId: string
  ) {
    return this.cdnService.getTopicsForClass(classId, userId);
  }

  @Get('class/:classId/files')
  @ApiOperation({ summary: 'Get list of uploaded files for a class' })
  async getClassFiles(
    @Param('classId') classId: string,
    @Query('userId') userId: string
  ) {
    return this.cdnService.getFilesForClass(classId, userId);
  }

  @Delete('class/:classId')
  @ApiOperation({ summary: 'Delete a class and all its files' })
  async deleteClass(
    @Param('classId') classId: string, 
    @Query('userId') userId: string
  ) {
    return this.cdnService.deleteClass(classId, userId);
  }
}