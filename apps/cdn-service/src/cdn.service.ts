import { Injectable, BadRequestException, Logger, ForbiddenException } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createWorker } from 'tesseract.js';
import { pdf } from 'pdf-to-img';
import { InjectRepository } from '@nestjs/typeorm'; 
import { Repository } from 'typeorm';                 
import { Class, CreateClassDto, Topic } from '@repo/database';

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

  constructor(
    @InjectRepository(Class)
    private classesRepository: Repository<Class>,
    
    @InjectRepository(Topic)
    private topicsRepository: Repository<Topic>
  ) {
    this.ensureTempDir();
  }

  private async ensureTempDir() {
    try {
      await fs.access(this.tempDir);
    } catch {
      await fs.mkdir(this.tempDir, { recursive: true });
    }
  }

  async createClass(data: CreateClassDto) {
      this.logger.log(`Service creating class for User: ${data.userId}, Name: ${data.className}`);
      
      try {
        // Updated search query to use the new userID field via relation
        let classEntity = await this.classesRepository.findOne({ 
            where: { user: { userID: data.userId }, name: data.className } 
        });

        if (!classEntity) {
            this.logger.log('Class not found. Creating new...');
            classEntity = this.classesRepository.create({
                user: { userID: data.userId } as any, // Link to UserID
                name: data.className,
                examDate: data.examDate ? new Date(data.examDate) : undefined,
                examLocation: data.examLocation
            });
        } else {
            this.logger.log(`Class found (ID: ${classEntity.classID}). Updating metadata...`);
            
            if (data.examDate) classEntity.examDate = new Date(data.examDate);
            if (data.examLocation) classEntity.examLocation = data.examLocation;
        }

        const saved = await this.classesRepository.save(classEntity);
        this.logger.log(`Class saved successfully. ID: ${saved.classID}`);

        // Create a folder in S3 named after the classID (number)
        const folderKey = `${saved.classID}/`;
        await this.uploadToS3(folderKey, Buffer.from(''));
        
        return saved;

      } catch (error) {
        this.logger.error(`Error creating class: ${error.message}`);
        throw new BadRequestException('Failed to create or update class');
      }
  }

  async saveFile(data: { 
    filename: string; 
    content: Buffer; 
    userId: string; 
    className: string;
  }) {
    const sanitizedFilename = this.sanitizeFilename(data.filename);
    const tempFilePath = path.join(this.tempDir, `temp_${Date.now()}_${sanitizedFilename}`);

    try {
      // 1. === DATABASE LOGIC ===
      let classEntity = await this.classesRepository.findOne({ 
        where: { user: { userID: data.userId }, name: data.className } 
      });

      if (!classEntity) {
        classEntity = this.classesRepository.create({
          user: { userID: data.userId } as any,
          name: data.className
        });
        await this.classesRepository.save(classEntity);
      }
      
      const classId = classEntity.classID; // Use new numeric property

      // 2. === FILE PROCESSING LOGIC ===
      await fs.writeFile(tempFilePath, data.content);

      const s3OriginalKey = `${classId}/uploads/${sanitizedFilename}`;
      await this.uploadToS3(s3OriginalKey, data.content);

      const ext = path.extname(sanitizedFilename).toLowerCase();
      
      let result: any = { 
        filename: sanitizedFilename,
        classId: classId,
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
        const s3TextKey = `${classId}/processed/${path.basename(sanitizedFilename, ext)}.txt`;
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

  async getClassesForUser(userId: string) {
    return await this.classesRepository.find({
      where: { user: { userID: userId } },
      order: { createdAt: 'DESC' }
    });
  }

  async getTopicsForClass(classId: string, userId: string) {
    const classEntity = await this.classesRepository.findOne({ 
        where: { classID: classId },
        relations: ['user'] // Required to check the owner
    });

    if (!classEntity) {
        throw new BadRequestException('Class not found');
    }

    // Security Check
    if (classEntity.user.userID !== userId) {
        throw new ForbiddenException('You do not have permission to view this class.');
    }

    return this.topicsRepository.find({
      where: { class: { classID: classId } },
      order: { createdAt: 'ASC' }
    });
  }
  
  private async processPdfTextOnly(pdfPath: string, originalFilename: string): Promise<string> {
    const txtPath = path.join(this.tempDir, `${path.basename(originalFilename)}.txt`);
    try {
      const pdfBuffer = await fs.readFile(pdfPath);
      let text = '';
      
      try {
        const pdfExtraction = require('pdf-extraction');
        const data = await pdfExtraction(pdfBuffer);
        text = data.text.trim();
      } catch (e) {
        this.logger.warn(`Standard extraction failed: ${e.message}`);
      }

      if (!text || text.length < 50) {
        const worker = await createWorker('eng+pol');
        text = '';
        const document = await pdf(pdfPath, { scale: 2.0 }); 
        for await (const image of document) {
           const { data: { text: pageText } } = await worker.recognize(image);
           text += pageText + '\n\n';
        }
        await worker.terminate();
      }

      if (!text.trim()) text = "[ERROR: No text found even after OCR]";
      await fs.writeFile(txtPath, text, 'utf8');
      return txtPath;
    } catch (err) {
      this.logger.error(`PDF Processing error: ${err.message}`);
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
    } finally {
      await worker.terminate();
    }
  }

  private sanitizeFilename(filename: string): string {
    const baseName = path.basename(filename, path.extname(filename));
    const ext = path.extname(filename);
    const safeName = baseName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 100);
    return safeName + ext.toLowerCase();
  }

  private async uploadToS3(key: string, content: Buffer) {
    await this.s3.send(new PutObjectCommand({ 
        Bucket: this.bucket, 
        Key: key, 
        Body: content 
    }));
  }

  private getPublicUrl(key: string) {
    return `https://${this.bucket}.s3.${process.env.AWS_REGION!}.amazonaws.com/${key}`;
  }
}