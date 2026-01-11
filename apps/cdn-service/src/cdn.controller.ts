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
  
  @Post('upload')
  @ApiOperation({ summary: 'Upload batch of files' })
  @ApiResponse({ status: 201, description: 'Files uploaded and processing started.' })
  @ApiBody({ type: [UploadFileDto] }) 
  async uploadFiles(@Body() data: UploadFileDto[]) {
    
    if (!data || data.length === 0) {
        throw new BadRequestException('No file data provided');
    }

    const results: any[] = [];
    const { userId } = data[0]!; 

    for (const file of data) {
      const buffer = Buffer.from(file.content, 'base64');
      results.push(
        await this.cdnService.saveFile({
          filename: file.filename,
          content: buffer,
          userId: file.userId,
          className: file.className,
        })
      );
    }

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
            this.httpService.post(processingUrl, { userId, classId }, {
                timeout: 600000 
            })
        );
        this.logger.log('Processing workflow completed successfully.');
      } catch (error: any) {
          this.logger.error(`Failed to trigger processing: ${error.message}`);
      }
  }

  @Post('create-class')
  @ApiOperation({ summary: 'Create or Update a class' })
  async createClass(@Body() body: CreateClassDto) {
      this.logger.log(`Received CreateClass Request: ${JSON.stringify(body)}`); 
      
      return this.cdnService.createClass(body);
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