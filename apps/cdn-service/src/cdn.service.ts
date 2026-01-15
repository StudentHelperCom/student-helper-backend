import { 
  Injectable, 
  BadRequestException, 
  Logger, 
  ForbiddenException, 
  OnModuleInit, 
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
import { ClassesRepository, TopicsRepository } from '@repo/database'; 
import { CreateClassDto } from '@repo/common';
import { DataSource } from 'typeorm';
import { Class, Topic } from '@repo/database';

@Injectable()
export class CdnService implements OnModuleInit {
  private readonly logger = new Logger(CdnService.name);
  
  // Persistent root directory for files
  private rootTempDir = path.join(process.cwd(), 'cdn_temp_storage');
  
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(
    private readonly configService: ConfigService,
    // ZMIANA: Wstrzykujemy repozytoria zamiast CdnDatabaseService
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

  /**
   * Startup Cleanup
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
    filename: string; content: Buffer; userId: string; className: string;
  }) {
    const sanitizedFilename = this.sanitizeFilename(data.filename);
    const uniquePrefix = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const tempFilePath = path.join(this.rootTempDir, `${uniquePrefix}_${sanitizedFilename}`);
    const filesToCleanup: string[] = [tempFilePath];

    // Rozpoczynamy transakcję
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Logika bazy danych (wewnątrz transakcji)
      let classEntity = await queryRunner.manager.findOne(Class, { 
        where: { user: { userID: data.userId }, name: data.className } 
      });

      if (!classEntity) {
        classEntity = queryRunner.manager.create(Class, {
          user: { userID: data.userId } as any,
          name: data.className
        });
        await queryRunner.manager.save(classEntity);
      }
      
      const classId = classEntity.classID;

      // 2. Przetwarzanie plików (lokalnie)
      await fs.writeFile(tempFilePath, data.content);
      const ext = path.extname(sanitizedFilename).toLowerCase();
      let tempTextPath: string | null = null;
      
      // OCR robimy PRZED uploadem do S3 i commitem, żeby w razie błędu nie śmiecić
      if (ext === '.pdf') {
        tempTextPath = await this.processPdfTextOnly(tempFilePath, sanitizedFilename, uniquePrefix);
      } else if (['.jpg', '.jpeg', '.png', '.tiff', '.bmp'].includes(ext)) {
        tempTextPath = await this.processImage(tempFilePath, sanitizedFilename, uniquePrefix);
      }

      // 3. Upload do S3 (To jest punkt krytyczny)
      const s3OriginalKey = `${classId}/uploads/${sanitizedFilename}`;
      await this.uploadToS3(s3OriginalKey, data.content);

      let s3TextKey: string | null = null;
      let textContent: string | null = null;

      if (tempTextPath) {
        filesToCleanup.push(tempTextPath);
        textContent = await fs.readFile(tempTextPath, 'utf8');
        s3TextKey = `${classId}/processed/${path.basename(sanitizedFilename, ext)}.txt`;
        await this.uploadToS3(s3TextKey, Buffer.from(textContent, 'utf8'));
      }

      // 4. Zatwierdzenie transakcji DB (dopiero jak S3 i OCR się udały)
      await queryRunner.commitTransaction();

      return { 
        filename: sanitizedFilename,
        classId: classId,
        s3OriginalUrl: this.getPublicUrl(s3OriginalKey),
        s3TextUrl: s3TextKey ? this.getPublicUrl(s3TextKey) : undefined
      };

    } catch (error) {
      // ROLLBACK BAZY DANYCH
      await queryRunner.rollbackTransaction();
      this.logger.error('File processing error (Rollback executed):', error);
      
      // Opcjonalnie: Tutaj można by dodać logikę czyszczenia S3, jeśli upload się powiódł, a commit bazy nie
      // ale w obecnej kolejności (Upload -> Commit) rollback bazy jest bezpieczny.
      
      throw new BadRequestException('Failed to process or upload file');
    } finally {
      await queryRunner.release();
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
    await this.s3.send(new PutObjectCommand({ 
        Bucket: this.bucket, 
        Key: key, 
        Body: content 
    }));
  }

  private getPublicUrl(key: string) {
    return `https://${this.bucket}.s3.${this.configService.get<string>('AWS_REGION')}.amazonaws.com/${key}`;
  }

  // --- Main Business Logic Methods using Shared Repositories ---

  async createClass(userId: string, data: CreateClassDto) {
    this.logger.log(`Service creating class for User: ${userId}, Name: ${data.className}`);

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
      
      // Próba utworzenia folderu w S3
      const folderKey = `${saved.classID}/`;
      try {
        await this.uploadToS3(folderKey, Buffer.from(''));
      } catch (s3Error) {
        throw new InternalServerErrorException("Failed to initialize S3 storage for class");
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Class saved successfully. ID: ${saved.classID}`);
      return saved;

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      if (error instanceof ConflictException) throw error;
      this.logger.error(`Error creating class: ${error.message}`);
      throw new BadRequestException('Failed to create class');
    } finally {
      await queryRunner.release();
    }
  }

  async getClassesForUser(userId: string) {
    return await this.classesRepo.findAllByUserId(userId);
  } 

  async getTopicsForClass(classId: string, userId: string) {
    const classEntity = await this.classesRepo.findByIdWithUser(classId);

    if (!classEntity) throw new BadRequestException('Class not found');
    
    if (classEntity.user.userID !== userId) {
        throw new ForbiddenException('You do not have permission to view this class.');
    }

    return await this.topicsRepo.findByClassId(classId);
  } 

  async getFilesForClass(classId: string, userId: string) {
    const classEntity = await this.classesRepo.findByIdWithUser(classId);

    if (!classEntity) throw new BadRequestException('Class not found');
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
        return {
          filename: path.basename(file.Key!),
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

async deleteClass(classId: string, userId: string) {
    this.logger.log(`Attempting to delete class ${classId} for user ${userId}`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Sprawdź uprawnienia i zablokuj wiersz (Pessimistic Write)
      const classEntity = await queryRunner.manager.findOne(Class, {
        where: { classID: classId },
        relations: ['user'],
        lock: { mode: 'pessimistic_write' } // Blokujemy, żeby nikt inny nie usunął w międzyczasie
      });

      if (!classEntity) throw new BadRequestException('Class not found');
      if (classEntity.user.userID !== userId) {
        throw new ForbiddenException('You do not have permission to delete this class.');
      }

      // 2. Usuń z DB (najpierw DB - dzięki transakcji to bezpieczne)
      // Cascade powinno usunąć Topiki, ale dla pewności używamy managera
      await queryRunner.manager.delete(Topic, { class: { classID: classId } as any });
      await queryRunner.manager.delete(Class, classId);

      // 3. Usuń z S3
      // Jeśli to zawiedzie, wycofamy usunięcie z DB
      try {
        await this.deleteS3Folder(`${classId}/`);
      } catch (s3Error: any) {
         this.logger.error(`S3 deletion failed: ${s3Error.message}. Rolling back DB deletion.`);
         throw new InternalServerErrorException('Failed to delete files from storage, aborting operation.');
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Class ${classId} deleted successfully.`);
      return { status: 'success', message: 'Class and all related data deleted.' };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
  
  private async deleteS3Folder(prefix: string) {
    let continuationToken: string | undefined = undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      });

      const listResponse = await this.s3.send(listCommand) as ListObjectsV2CommandOutput;
      
      if (listResponse.Contents && listResponse.Contents.length > 0) {
        const objectsToDelete = listResponse.Contents.map(obj => ({ Key: obj.Key }));
        
        await this.s3.send(new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: objectsToDelete }
        }));
        
        this.logger.log(`Deleted ${objectsToDelete.length} items from S3 prefix ${prefix}`);
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);
  }
}