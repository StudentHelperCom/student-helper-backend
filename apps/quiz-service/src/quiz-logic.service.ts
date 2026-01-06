import { Injectable, Logger } from '@nestjs/common';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

@Injectable()
export class QuizLogicService {
  private readonly logger = new Logger(QuizLogicService.name);
  private bucket = process.env.AWS_S3_BUCKET!;

  private s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  async getTopicContent(classId: string, topicRandomId: string): Promise<string> {
    const key = `${classId}/${topicRandomId}.pdf`;
    
    try {
      this.logger.log(`Fetching topic from S3: ${key}`);
      
      const pdfBuffer = await this.getFileFromS3(key);
      const pdfExtraction = require('pdf-extraction');
      
      const data = await pdfExtraction(pdfBuffer);
      const text = data.text;

      if (!text || text.trim().length < 10) {
          this.logger.warn(`File ${key} seems to be empty or does not contain a text layer.`);
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