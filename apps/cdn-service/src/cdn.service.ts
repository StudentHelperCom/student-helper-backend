import { Injectable, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Poppler } from 'node-poppler';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class CdnService {
  private tempDir = path.join(process.cwd(), 'temp_processing');
  private poppler: Poppler;

  private tesseractConfig = {
    lang: 'eng+pol',
    oem: 3,
    psm: 12,
  };

  private s3 = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  private bucket = process.env.AWS_S3_BUCKET!;

  constructor() {
    this.poppler = new Poppler();
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
        tempTextPath = await this.processPdfHybrid(tempFilePath, sanitizedFilename);
      } else if (['.jpg', '.jpeg', '.png', '.tiff'].includes(ext)) {
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
      console.error('File processing error:', error);
      throw new BadRequestException('Failed to process or upload file');
    } finally {
      await fs.unlink(tempFilePath).catch(() => {});
    }
  }

  private sanitizeFilename(filename: string): string {
    const baseName = path.basename(filename, path.extname(filename));
    const ext = path.extname(filename);
    const safeName = baseName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 100);
    return safeName + ext.toLowerCase();
  }

  private async uploadToS3(key: string, content: Buffer) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: this.getMimeType(key),
      }),
    );
  }

  private getPublicUrl(key: string) {
    return `https://${this.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  }

  private getMimeType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    if (ext === '.txt') return 'text/plain';
    if (ext === '.png') return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
  }

  private async processPdfHybrid(pdfPath: string, originalFilename: string): Promise<string> {
    const baseName = path.basename(originalFilename, '.pdf');
    const txtPath = path.join(this.tempDir, `${baseName}_${Date.now()}.txt`);

    try {
      await this.poppler.pdfToText(pdfPath, txtPath);
      const text = (await fs.readFile(txtPath, 'utf8')).trim();

      if (!text || text.length < 10) {
        await fs.unlink(txtPath).catch(() => {});
        return this.processPdfWithOCR(pdfPath, originalFilename);
      }
      return txtPath;
    } catch (err) {
      await fs.unlink(txtPath).catch(() => {});
      return this.processPdfWithOCR(pdfPath, originalFilename);
    }
  }

  private async processPdfWithOCR(pdfPath: string, originalFilename: string): Promise<string> {
    const baseName = path.basename(originalFilename, '.pdf');
    const outputPrefix = path.join(this.tempDir, `${baseName}_ocr`);
    
    try {
      await this.poppler.pdfToCairo(pdfPath, outputPrefix, { pngFile: true });

      const files = await fs.readdir(this.tempDir);
      const imageFiles = files.filter(f => f.startsWith(`${baseName}_ocr`) && f.endsWith('.png')).sort();

      const tesseract = await import('node-tesseract-ocr');
      let fullText = '';

      for (const imgFile of imageFiles) {
        const imgPath = path.join(this.tempDir, imgFile);
        const text = await tesseract.recognize(imgPath, this.tesseractConfig);
        fullText += text + '\n\n';
        await fs.unlink(imgPath).catch(() => {});
      }

      const txtPath = path.join(this.tempDir, `${baseName}_ocr_${Date.now()}.txt`);
      await fs.writeFile(txtPath, fullText, 'utf8');
      return txtPath;
    } catch (error) {
      throw error;
    }
  }

  private async processImage(imagePath: string, originalFilename: string): Promise<string> {
    const baseName = path.basename(originalFilename, path.extname(originalFilename));
    const txtPath = path.join(this.tempDir, `${baseName}_${Date.now()}.txt`);

    try {
      const tesseract = await import('node-tesseract-ocr');
      const text = await tesseract.recognize(imagePath, this.tesseractConfig);
      await fs.writeFile(txtPath, text, 'utf8');
      return txtPath;
    } catch (error) {
      throw error;
    }
  }
}