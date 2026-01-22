import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class QuizLogicService {
  private readonly logger = new Logger(QuizLogicService.name);
  private readonly bucket: string;
  private readonly s3: S3Client;

  constructor(private readonly configService: ConfigService) {
    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    
    this.s3 = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });
  }

  async getTopicContent(classId: string, topicRandomId: string): Promise<string> {
    const key = `${classId}/${topicRandomId}.txt`;
    
    try {
      this.logger.log(`Fetching topic from S3: ${key}`);
      const fileBuffer = await this.getFileFromS3(key);
      const text = fileBuffer.toString('utf-8');

      if (!text || text.trim().length < 10) {
          this.logger.warn(`File ${key} seems to be empty.`);
          return ""; 
      }
      return text.trim();

    } catch (error: any) {
      this.logger.error(`Error processing topic ${key}: ${error.message}`);
      return "";
    }
  }

  private async getFileFromS3(key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const response = await this.s3.send(command);
    const stream = response.Body as Readable;
    
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }
}