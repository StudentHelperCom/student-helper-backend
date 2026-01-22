import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  S3Client, 
  GetObjectCommand, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  ListObjectsV2CommandOutput, 
  DeleteObjectsCommand, 
  HeadObjectCommand
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import * as path from 'path';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

@Injectable()
export class ProcessingLogicService {
  private readonly logger = new Logger(ProcessingLogicService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.s3 = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
      requestHandler: {
        connectionTimeout: 5000,
        socketTimeout: 5000,
      } as any
    });

    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
  }

  public sanitizeFilename(filename: string): string {
    const baseName = path.basename(filename, path.extname(filename));
    const ext = path.extname(filename);
    const safeName = baseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    return safeName + ext.toLowerCase();
  }

  public async getFile(key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  public async uploadFile(key: string, buffer: Buffer, contentType?: string) {
    if (!contentType) {
      if (key.endsWith('.pdf')) contentType = 'application/pdf';
      else if (key.endsWith('.txt')) contentType = 'text/plain; charset=utf-8';
      else contentType = 'application/octet-stream';
    }
    return this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType }));
  }

  public async deleteFolderContents(prefix: string) {
    try {
      let continuationToken: string | undefined = undefined;
      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listRes: ListObjectsV2CommandOutput = await this.s3.send(listCommand);
        
        if (listRes.Contents && listRes.Contents.length > 0) {
          const objectsToDelete = listRes.Contents.map((obj) => ({ Key: obj.Key }));
          await this.s3.send(new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objectsToDelete }
          }));
        }
        continuationToken = listRes.NextContinuationToken;
      } while (continuationToken);
    } catch (error: any) {
      this.logger.error(`Failed to cleanup folder ${prefix}: ${error.message}`);
    }
  }

  public async checkFileExists(key: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') return false;
      return false;
    }
  }
  
  public async isFolderNotEmpty(prefix: string): Promise<boolean> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: 1
    });
    const res = await this.s3.send(command);
    return !!(res.Contents && res.Contents.length > 0);
  }

  public async deleteFile(key: string) {
    await this.s3.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
            Objects: [{ Key: key }]
        }
    }));
  }

  public async getFileWithRetry(key: string, attempts = 3): Promise<Buffer> {
    for (let i = 0; i < attempts; i++) {
        try {
            return await this.getFile(key);
        } catch (error: any) {
            this.logger.warn(`Attempt ${i + 1} failed for ${key}: ${error.message}`);
            if (i === attempts - 1) throw error;
            await sleep(1000 * (i + 1));
        }
    }
    throw new Error('Unreachable code');
  }

  public async sleep(ms: number) {
      return sleep(ms);
  }

  public async listFiles(prefix: string): Promise<string[]> {
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    });

    const res: ListObjectsV2CommandOutput = await this.s3.send(listCommand);
    return res.Contents?.map(obj => obj.Key!) || [];
  }
}