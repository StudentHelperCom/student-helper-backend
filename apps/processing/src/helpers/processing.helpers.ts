import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config'; // Import this
import { 
  S3Client, 
  GetObjectCommand, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  ListObjectsV2CommandOutput, 
  DeleteObjectsCommand 
} from '@aws-sdk/client-s3';
import { PDFDocument, rgb } from 'pdf-lib';
import { Readable } from 'stream';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

@Injectable()
export class ProcessingHelpers {
  private readonly logger = new Logger(ProcessingHelpers.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    // 1. Initialize S3 inside the constructor using ConfigService
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

    // 2. Safely retrieve the bucket name
    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
  }

  // -------------------------------------------------------------------------
  // S3 & File Helpers
  // -------------------------------------------------------------------------

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
      else if (key.endsWith('.txt')) contentType = 'text/plain';
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
    } catch (error) {
      this.logger.error(`Failed to cleanup folder ${prefix}: ${error.message}`);
    }
  }

  public async deleteFile(key: string) {
    await this.s3.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
            Objects: [{ Key: key }]
        }
    }));
  }

  // -------------------------------------------------------------------------
  // Retry Logic Helpers
  // -------------------------------------------------------------------------

  public async getFileWithRetry(key: string, attempts = 3): Promise<Buffer> {
    for (let i = 0; i < attempts; i++) {
        try {
            return await this.getFile(key);
        } catch (error) {
            this.logger.warn(`Attempt ${i + 1} failed for ${key}: ${error.message}`);
            if (i === attempts - 1) throw error;
            await sleep(1000 * (i + 1)); // Backoff: 1s, 2s, 3s
        }
    }
    throw new Error('Unreachable code');
  }

  public async sleep(ms: number) {
      return sleep(ms);
  }

  // -------------------------------------------------------------------------
  // PDF Generation Helpers
  // -------------------------------------------------------------------------

  public async buildPdf(content: string, id: string): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);

    const regularFontBytes = fs.readFileSync(
      path.join(__dirname, '..','..', 'assets', 'fonts', 'DejaVuSans.ttf')
    );

    const font = await pdf.embedFont(regularFontBytes);

    let page = pdf.addPage([595, 842]);
    const topicSize = 14;
    const fontSize = 11;
    const lineHeight = 14;
    const margin = 50;
    const maxWidth = page.getWidth() - margin * 2;

    let x = margin;
    let y = page.getHeight() - margin;

    const lines = content.split('\n').filter(line => line.trim().length > 0);

    for (const line of lines) {
      if (y < margin + 40) {
        page = pdf.addPage([595, 842]);
        y = page.getHeight() - margin;
      }

      const cleanLine = line.trim();

      // Ensure we only bold ACTUAL top-level headers, not sub-lists we masked with ')'
      // The splitMergedPdf turns sublists into "1)" so this regex "^\d+\." won't match them.
      const isTopicLine = /^\d+\.\s/.test(cleanLine);

      if (isTopicLine) {
        if (y < page.getHeight() - margin) {
          y -= 8;
        }
        page.drawText(cleanLine, {
          x,
          y,
          size: topicSize,
          font: font,
          color: rgb(0, 0, 0),
        });

        y -= topicSize + 4;
        continue;
      }

      const wrapped = this.wrapText(cleanLine, maxWidth, font, fontSize);

      for (const wLine of wrapped) {
        if (y < margin) {
          page = pdf.addPage([595, 842]);
          y = page.getHeight() - margin;
        }

        page.drawText(wLine, {
          x,
          y,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });

        y -= lineHeight;
      }
    }

    return Buffer.from(await pdf.save());
  }

  public wrapText(text: string, maxWidth: number, font: any, size: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, size);

      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
  public async listPdfFiles(prefix: string): Promise<string[]> {
  const listCommand = new ListObjectsV2Command({
    Bucket: this.bucket,
    Prefix: prefix,
  });

  const res: ListObjectsV2CommandOutput = await this.s3.send(listCommand);
  return res.Contents?.filter(obj => obj.Key?.endsWith('.pdf')).map(obj => obj.Key!) || [];
}
}

