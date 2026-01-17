import { 
  Injectable, 
  BadRequestException, 
  Logger, 
  ForbiddenException, 
  ConflictException, 
  InternalServerErrorException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { 
  S3Client, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  DeleteObjectsCommand, 
  ListObjectsV2CommandOutput 
} from '@aws-sdk/client-s3';
import { createWorker } from 'tesseract.js';
import { DataSource } from 'typeorm';
import { ClassesRepository, TopicsRepository, Class, Topic } from '@repo/database'; 
import { CreateClassDto } from '@repo/common';

@Injectable()
export class CdnService {
  private readonly logger = new Logger(CdnService.name);
  private rootTempDir = path.join(process.cwd(), 'cdn_temp_storage');
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly classesRepo: ClassesRepository,
    private readonly topicsRepo: TopicsRepository,
    private readonly dataSource: DataSource
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

  async prepareUploadEnvironment(userId: string, className: string): Promise<string> {
    // 1. Local Temp Storage Cleanup
    try {
      await fs.access(this.rootTempDir);
      const files = await fs.readdir(this.rootTempDir);
      for (const file of files) {
        await fs.unlink(path.join(this.rootTempDir, file)).catch(() => {});
      }
      this.logger.log(`[LOCAL] CDN temp storage cleared: ${this.rootTempDir}`);
    } catch {
      await fs.mkdir(this.rootTempDir, { recursive: true });
      this.logger.log(`[LOCAL] CDN temp storage initialized: ${this.rootTempDir}`);
    }

    // 2. Initialize Transaction
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(`[PREPARE] Preparing environment for User: ${userId}, Class: ${className}`);

      // 3. DB Logic: Find or Create Class
      let classEntity = await queryRunner.manager.findOne(Class, { 
        where: { user: { userID: userId }, name: className } 
      });

      if (!classEntity) {
        classEntity = queryRunner.manager.create(Class, {
          user: { userID: userId } as any,
          name: className
        });
        await queryRunner.manager.save(classEntity);
      }
      const classId = classEntity.classID;

      // 4. Force Clean S3 Folder (ONCE per batch)
      this.logger.log(`[S3] Cleaning target folder for class ${classId}...`);
      await this.deleteS3Folder(`${classId}/`);

      await queryRunner.commitTransaction();
      return classId;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`[PREPARE] Failed to prepare upload environment: ${error}`);
      throw new InternalServerErrorException('Failed to initialize upload session');
    } finally {
      await queryRunner.release();
    }
  }

  async saveFile(data: { 
    filename: string; content: Buffer; classId: string;
  }) {
    const { filename, content, classId } = data;
    const sanitizedFilename = this.sanitizeFilename(filename);
    const uniquePrefix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempFilePath = path.join(this.rootTempDir, `${uniquePrefix}_${sanitizedFilename}`);
    
    const filesToCleanup: string[] = [tempFilePath];
    const s3KeysCreated: string[] = [];

    try {
      this.logger.log(`[FILE] Processing: ${sanitizedFilename} for class ID: ${classId}`);

      // 1. Local Processing (OCR)
      await fs.writeFile(tempFilePath, content);
      const ext = path.extname(sanitizedFilename).toLowerCase();
      let tempTextPath: string | null = null;
      
      if (ext === '.pdf') {
        tempTextPath = await this.processPdfTextOnly(tempFilePath, sanitizedFilename, uniquePrefix);
      }

      // 2. Upload Original File to S3
      const s3OriginalKey = `${classId}/uploads/${sanitizedFilename}`;
      await this.uploadToS3(s3OriginalKey, content);
      s3KeysCreated.push(s3OriginalKey);

      // 3. Upload Text File to S3 (if OCR was successful)
      let s3TextKey: string | null = null;
      if (tempTextPath) {
        filesToCleanup.push(tempTextPath);
        const textContent = await fs.readFile(tempTextPath, 'utf8');
        
        if (textContent.trim().length > 0) {
            s3TextKey = `${classId}/processed/${path.basename(sanitizedFilename, ext)}.txt`;
            await this.uploadToS3(s3TextKey, Buffer.from(textContent, 'utf8'));
            s3KeysCreated.push(s3TextKey);
            this.logger.log(`[UPLOAD] Text file uploaded to: ${s3TextKey}`);
        }
      }
      return { 
        filename: sanitizedFilename,
        classId: classId,
        s3OriginalUrl: this.getPublicUrl(s3OriginalKey),
        s3TextUrl: s3TextKey ? this.getPublicUrl(s3TextKey) : undefined
      };

    } catch (error) {
      this.logger.error(`[ERROR] File processing failed. Reason: ${error}`);

      if (s3KeysCreated.length > 0) {
        await Promise.all(s3KeysCreated.map(key => 
          this.s3.send(new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: [{ Key: key }] }
          })).catch(e => this.logger.error(`S3 Rollback failed for ${key}: ${e}`))
        ));
      }
      throw new BadRequestException(`Failed to process file ${filename}`);
    } finally {
      // Clean local temp files for THIS file
      for (const filePath of filesToCleanup) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
  }

  async createClass(userId: string, data: CreateClassDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existingClass = await queryRunner.manager.findOne(Class, {
          where: { user: { userID: userId }, name: data.className }
      });

      if (existingClass) {
          throw new ConflictException('Class with this name already exists');
      }
      
      const newClass = queryRunner.manager.create(Class, {
          user: { userID: userId } as any,
          name: data.className,
          examDate: data.examDate ? new Date(data.examDate) : undefined,
          examLocation: data.examLocation
      });

      const saved = await queryRunner.manager.save(newClass);
      
      const folderKey = `${saved.classID}/`;
      try {
        await this.uploadToS3(folderKey, Buffer.from(''));
      } catch (s3Error) {
         throw new InternalServerErrorException("Failed to initialize S3 storage for class");
      }

      await queryRunner.commitTransaction();
      return saved;

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      if (error instanceof ConflictException) throw error;
      throw new BadRequestException('Failed to create class');
    } finally {
      await queryRunner.release();
    }
  }

  async getClassesForUser(userId: string) {
    return await this.classesRepo.findByUserId(userId);
  } 

  async getTopicsForClass(classId: string, userId: string) {
    const classEntity = await this.classesRepo.findByIdWithUser(classId);
    if (!classEntity) throw new BadRequestException('Class not found');
    if (classEntity.user.userID !== userId) throw new ForbiddenException('Access denied');
    return await this.topicsRepo.findByClassId(classId);
  } 

  async getFilesForClass(classId: string, userId: string) {
    const classEntity = await this.classesRepo.findByIdWithUser(classId);
    if (!classEntity) throw new BadRequestException('Class not found');
    if (classEntity.user.userID !== userId) throw new ForbiddenException('Access denied');

    const prefix = `${classId}/uploads/`;
    try {
      const command = new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix });
      const response = await this.s3.send(command);
      const files = (response.Contents || []).map((file) => {
        return {
          filename: path.basename(file.Key!),
          size: file.Size,
          created: file.LastModified
        };
      });
      return { classId: classId, className: classEntity.name, totalFiles: files.length, files: files };
    } catch (error: any) {
      throw new BadRequestException('Failed to retrieve file list from storage.');
    }
  }

async deleteClass(classId: string, userId: string) {
    this.logger.log(`Attempting to delete class ${classId} for user ${userId}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const classEntity = await queryRunner.manager
        .createQueryBuilder(Class, 'class')
        .setLock('pessimistic_write')
        .innerJoinAndSelect('class.user', 'user')
        .where('class.classID = :classId', { classId })
        .getOne();

      if (!classEntity) throw new BadRequestException('Class not found');
      if (classEntity.user.userID !== userId) throw new ForbiddenException('Access denied');
      
      await queryRunner.manager.delete(Topic, { class: { classID: classId } as any });
      await queryRunner.manager.delete(Class, classId);
      
      try {
        await this.deleteS3Folder(`${classId}/`);
      } catch (s3Error: any) {
         this.logger.error(`S3 deletion failed: ${s3Error.message}. Rolling back DB deletion.`);
         throw new InternalServerErrorException('Failed to delete files from storage');
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Class ${classId} deleted successfully.`);
      return { status: 'success', message: 'Class deleted.' };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
        await queryRunner.release();
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
    return `https://${this.bucket}.s3.${this.configService.get<string>('AWS_REGION')}.amazonaws.com/${key}`;
  }

  private async deleteS3Folder(prefix: string) {
    let hasContents = true;
    while (hasContents) {
      const listCommand = new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix });
      const listResponse = await this.s3.send(listCommand) as ListObjectsV2CommandOutput;
      
      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        hasContents = false;
        break;
      }
      const objectsToDelete = listResponse.Contents.map(obj => ({ Key: obj.Key }));
      await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objectsToDelete } }));
      this.logger.log(`Deleted batch of ${objectsToDelete.length} items from S3 prefix "${prefix}"`);
    }
  }
}