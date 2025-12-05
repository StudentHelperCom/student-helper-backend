import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img'; 

@Injectable()
export class CdnService {
  private readonly logger = new Logger(CdnService.name);
  private tempDir = path.join(process.cwd(), 'temp_processing');

  private s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  private bucket = process.env.AWS_S3_BUCKET!;

  constructor() {
    this.ensureTempDir();
  }

  private async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  async saveFile(data: { filename: string; content: Buffer; userId: string; className: string }) {
    const sanitizedFilename = this.sanitizeFilename(data.filename);
    const tempFilePath = path.join(this.tempDir, `temp_${Date.now()}_${sanitizedFilename}`);

    try {
      await fs.writeFile(tempFilePath, data.content);

      const sanitizedClassName = this.sanitizeFilename(data.className).replace(/\.[^/.]+$/, "");
      const s3OriginalKey = `${data.userId}/${sanitizedClassName}/uploads/${sanitizedFilename}`;
      
      await this.uploadToS3(s3OriginalKey, data.content);

      const ext = path.extname(sanitizedFilename).toLowerCase();
      let result: any = { 
        filename: sanitizedFilename,
        s3OriginalUrl: this.getPublicUrl(s3OriginalKey)
      };

      let tempTextPath: string | null = null;

      if (ext === '.pdf') {
        tempTextPath = await this.processPdfTextOnly(tempFilePath, sanitizedFilename);
      } else if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp'].includes(ext)) {
        tempTextPath = await this.processImage(tempFilePath, sanitizedFilename);
      }

      if (tempTextPath) {
        const textContent = await fs.readFile(tempTextPath, 'utf8');
        const s3TextKey = `${data.userId}/${sanitizedClassName}/processed/${path.basename(sanitizedFilename, ext)}.txt`;
        
        await this.uploadToS3(s3TextKey, Buffer.from(textContent, 'utf8'));
        result.s3TextUrl = this.getPublicUrl(s3TextKey);
        await fs.unlink(tempTextPath).catch(() => {});
      }

      return result;

    } catch (error) {
      this.logger.error('File processing error:', error);
      throw new BadRequestException('Failed to process or upload file');
    } finally {
      await fs.unlink(tempFilePath).catch(() => {});
    }
  }

  private async processPdfTextOnly(pdfPath: string, originalFilename: string): Promise<string> {
    const txtPath = path.join(this.tempDir, `${path.basename(originalFilename)}.txt`);

    try {
      const pdfBuffer = await fs.readFile(pdfPath);
      let text = '';

      // 1. Try Standard Extraction (Fast)
      try {
        const pdfExtraction = require('pdf-extraction');
        const data = await pdfExtraction(pdfBuffer);
        text = data.text.trim();
      } catch (e) {
        this.logger.warn(`Standard extraction failed: ${e.message}`);
      }

      // 2. Fallback to OCR (Scan detection)
      if (!text || text.length < 50) {
        this.logger.warn(`PDF ${originalFilename} appears scanned. Starting OCR with Puppeteer...`);
        
        const worker = await createWorker('eng+pol');
        text = '';
        
        // This yields Buffer objects of each page image
        const document = await pdf(pdfPath, { scale: 2.0 }); 

        for await (const image of document) {
           const { data: { text: pageText } } = await worker.recognize(image);
           text += pageText + '\n\n';
        }
        
        await worker.terminate();
      }
      
      if (!text.trim()) {
        text = "[ERROR: No text found even after OCR]";
      }
      
      await fs.writeFile(txtPath, text, 'utf8');
      return txtPath;

    } catch (err) {
      this.logger.error(`PDF Parse failed for ${originalFilename}`, err);
      throw err;
    }
  }

  private async processImage(imagePath: string, originalFilename: string): Promise<string> {
    const baseName = path.basename(originalFilename, path.extname(originalFilename));
    const txtPath = path.join(this.tempDir, `${baseName}_${Date.now()}.txt`);

    const worker = await createWorker('eng+pol');

    try {
      const { data: { text } } = await worker.recognize(imagePath);
      await fs.writeFile(txtPath, text, 'utf8');
      return txtPath;
    } catch (error) {
      this.logger.error(`Image OCR failed`, error);
      throw error;
    } finally {
      await worker.terminate();
    }
  }

  private sanitizeFilename(filename: string): string {
    const baseName = path.basename(filename, path.extname(filename));
    const ext = path.extname(filename);
    const safeName = baseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    return safeName + ext.toLowerCase();
  }

  private async uploadToS3(key: string, content: Buffer) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: content }));
  }

  private getPublicUrl(key: string) {
    return `https://${this.bucket}.s3.${process.env.AWS_REGION!}.amazonaws.com/${key}`;
  }
}