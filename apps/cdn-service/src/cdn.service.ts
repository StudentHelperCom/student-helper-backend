import { Injectable, BadRequestException, Logger, ForbiddenException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createWorker } from 'tesseract.js';
// Note: pdf-to-img is imported dynamically below due to ESM/top-level await issues
import { InjectRepository } from '@nestjs/typeorm'; 
import { Repository } from 'typeorm';                 
import { Class, Topic } from '@repo/database';
import { CreateClassDto } from '@repo/common';

@Injectable()
export class CdnService implements OnModuleInit {
  private readonly logger = new Logger(CdnService.name);
  
  // Persistent root directory for files
  private rootTempDir = path.join(process.cwd(), 'cdn_temp_storage');
  
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Class)
    private classesRepository: Repository<Class>,
    @InjectRepository(Topic)
    private topicsRepository: Repository<Topic>
  ) {
    this.s3 = new S3Client({
      region: this.configService.getOrThrow<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>('AWS_SECRET_ACCESS_KEY'),
      },
    });

    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
  }

  /**
   * Startup Cleanup: Clears any orphaned files from previous 
   * crashes as soon as the container/service starts up.
   */
  async onModuleInit() {
    try {
      await fs.access(this.rootTempDir);
      const files = await fs.readdir(this.rootTempDir);
      for (const file of files) {
        await fs.unlink(path.join(this.rootTempDir, file)).catch(() => {});
      }
      this.logger.log('CDN temp storage cleared for startup.');
    } catch {
      await fs.mkdir(this.rootTempDir, { recursive: true });
      this.logger.log('CDN temp storage directory initialized.');
    }
  }

  async saveFile(data: { 
    filename: string; 
    content: Buffer; 
    userId: string; 
    className: string;
  }) {
    const sanitizedFilename = this.sanitizeFilename(data.filename);
    
    // Create unique prefixes to avoid collisions in the shared folder
    const uniquePrefix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempFilePath = path.join(this.rootTempDir, `${uniquePrefix}_${sanitizedFilename}`);
    
    // Keep track of all files created to ensure they are deleted in 'finally'
    const filesToCleanup: string[] = [tempFilePath];

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
      
      const classId = classEntity.classID;

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
        tempTextPath = await this.processPdfTextOnly(tempFilePath, sanitizedFilename, uniquePrefix);
      } else if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp'].includes(ext)) {
        tempTextPath = await this.processImage(tempFilePath, sanitizedFilename, uniquePrefix);
      }

      if (tempTextPath) {
        filesToCleanup.push(tempTextPath);
        const textContent = await fs.readFile(tempTextPath, 'utf8');
        const s3TextKey = `${classId}/processed/${path.basename(sanitizedFilename, ext)}.txt`;
        await this.uploadToS3(s3TextKey, Buffer.from(textContent, 'utf8'));
        result.s3TextUrl = this.getPublicUrl(s3TextKey);
      }

      return result;

    } catch (error) {
      this.logger.error('File processing error:', error);
      throw new BadRequestException('Failed to process or upload file');
    } finally {
      // GUARANTEED CLEANUP
      for (const filePath of filesToCleanup) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
  }

  private async processPdfTextOnly(pdfPath: string, originalFilename: string, prefix: string): Promise<string> {
    const txtPath = path.join(this.rootTempDir, `${prefix}_${path.basename(originalFilename)}.txt`);
    try {
      const pdfBuffer = await fs.readFile(pdfPath);
      let text = '';
      
      try {
        const pdfExtraction = require('pdf-extraction');
        const data = await pdfExtraction(pdfBuffer);
        text = data.text.trim();
      } catch (e: any) {
        this.logger.warn(`Standard extraction failed: ${e.message}`);
      }

      if (!text || text.length < 50) {
        // Dynamic import for pdf-to-img due to ESM/top-level await
        const { pdf } = await import('pdf-to-img');
        const worker = await createWorker('eng+pol');
        const document = await pdf(pdfPath, { scale: 2.0 }); 
        for await (const image of document) {
           const { data: { text: pageText } } = await worker.recognize(image);
           text += pageText + '\n\n';
        }
        await worker.terminate();
      }

      await fs.writeFile(txtPath, text || "[ERROR: No text found]", 'utf8');
      return txtPath;
    } catch (err) {
      throw err;
    }
  }

  private async processImage(imagePath: string, originalFilename: string, prefix: string): Promise<string> {
    const baseName = path.basename(originalFilename, path.extname(originalFilename));
    const txtPath = path.join(this.rootTempDir, `${prefix}_${baseName}.txt`);
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
    // Bucket is now guaranteed to be defined via ConfigService
    await this.s3.send(new PutObjectCommand({ 
        Bucket: this.bucket, 
        Key: key, 
        Body: content 
    }));
  }

  private getPublicUrl(key: string) {
    return `https://${this.bucket}.s3.${this.configService.get<string>('AWS_REGION')}.amazonaws.com/${key}`;
  }

   async createClass(data: CreateClassDto) {

    this.logger.log(`Service creating class for User: ${data.userId}, Name: ${data.className}`);

   

    try {
      // Querying using the new userID relation field
      let classEntity = await this.classesRepository.findOne({
          where: { user: { userID: data.userId }, name: data.className }
      });
      if (!classEntity) {
          this.logger.log('Class not found. Creating new...');
          classEntity = this.classesRepository.create({
              user: { userID: data.userId } as any,
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

      const folderKey = `${saved.classID}/`;

      await this.uploadToS3(folderKey, Buffer.from(''));

     

      return saved;


    } catch (error: any) {

      this.logger.error(`Error creating class: ${error.message}`);

      throw new BadRequestException('Failed to create or update class');

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

        relations: ['user']

    });


    if (!classEntity) {

        throw new BadRequestException('Class not found');

    }


    // Security Check: Verify class ownership

    if (classEntity.user.userID !== userId) {

        throw new ForbiddenException('You do not have permission to view this class.');

    }

    return this.topicsRepository.find({
      where: { class: { classID: classId } },
      order: { createdAt: 'ASC' }
    });
  } 
  async getFilesForClass(classId: string, userId: string) {
    // 1. Verify Class Ownership
    const classEntity = await this.classesRepository.findOne({
      where: { classID: classId },
      relations: ['user']
    });

    if (!classEntity) {
      throw new BadRequestException('Class not found');
    }

    if (classEntity.user.userID !== userId) {
      throw new ForbiddenException('You do not have permission to view files for this class.');
    }

    const prefix = `${classId}/uploads/`;

    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix
      });

      const response = await this.s3.send(command);
      const files = (response.Contents || []).map((file) => {
        const key = file.Key!;
        const filename = path.basename(key);
        
        return {
          filename: filename,
          size: file.Size,
          created: file.LastModified
        };
      });

      return {
        classId: classId,
        className: classEntity.name,
        totalFiles: files.length,
        files: files
      };

    } catch (error: any) {
      this.logger.error(`Failed to list files from S3: ${error.message}`);
      throw new BadRequestException('Failed to retrieve file list from storage.');
    }
  }
}