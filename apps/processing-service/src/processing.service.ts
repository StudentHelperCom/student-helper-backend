import { Injectable, Logger } from '@nestjs/common';
import { ProcessingHelpers } from './helpers/processing.helpers';
import * as path from 'path';
import { ProcessingAi } from './helpers/processing.ai';
import { randomUUID } from 'crypto';
import { TopicsRepository } from '@repo/database';
import { Topic } from '@repo/database';

const BATCH_SIZE = 3;

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly helpers: ProcessingHelpers,
    private readonly aiService: ProcessingAi,
    private readonly topicsRepo: TopicsRepository,
  ) {}

  async executeFullWorkflow(classId: string) {
    this.logger.log(`=== STARTING FULL WORKFLOW FOR CLASS ID: ${classId} ===`);

    // Pre-cleanup: Usuwamy tylko jeśli folder istnieje
    this.logger.log(`Ensuring clean state for ${classId}...`);
    try {
        await Promise.all([
            this.helpers.deleteFolderContents(`${classId}/processed/`),
            this.helpers.deleteFolderContents(`${classId}/final/`)
        ]);
    } catch (e) {
        this.logger.warn(`Pre-cleanup warning (non-critical): ${e}`);
    }

    // STEP 1: Process
    let processResult;
    try {
      processResult = await this.process(classId);
      if (processResult.status === 'empty' || processResult.status === 'error') {
         this.logger.warn(`Workflow stopped at PROCESS step: ${processResult.message}`);
         return { step: 'process', status: 'failed', error: processResult.message };
      }
      this.logger.log(`✓ PROCESS step completed successfully`);
    } catch (error: any) {
      this.logger.error(`✗ PROCESS step failed: ${error.message}`);
      return { step: 'process', status: 'failed', error: error.message };
    }

    // STEP 2: Merge
    let mergeResult;
    try {
      mergeResult = await this.mergeFinalPdfsS3(classId);
      if (mergeResult.status === 'error') {
         this.logger.error(`Workflow stopped at MERGE step: ${mergeResult.message}`);
         // Compensating action: Cleanup processed files
         await this.helpers.deleteFolderContents(`${classId}/processed/`).catch(e => 
           this.logger.warn(`Compensating cleanup failed: ${e}`)
         );
         return { step: 'merge', status: 'failed', error: mergeResult.message };
      }
      this.logger.log(`✓ MERGE step completed successfully`);
    } catch (error: any) {
      this.logger.error(`✗ MERGE step failed: ${error.message}`);
      // Compensating action: Cleanup processed files
      await this.helpers.deleteFolderContents(`${classId}/processed/`).catch(e => 
        this.logger.warn(`Compensating cleanup failed: ${e}`)
      );
      return { step: 'merge', status: 'failed', error: error.message };
    }

    // STEP 3: Split
    let splitResult;
    try {
      splitResult = await this.splitMergedPdf(classId);
      this.logger.log(`✓ SPLIT step completed successfully`);
    } catch (error: any) {
      this.logger.error(`✗ SPLIT step failed: ${error.message}`);
      // Split ma własny rollback wewnątrz (transakcja), więc nie musimy tu robić cleanup
      return { step: 'split', status: 'failed', error: error.message };
    }

    // Post-cleanup: Tylko intermediate files
    this.logger.log(`Workflow complete. Cleaning up intermediate files for ${classId}...`);
    try {
        await this.helpers.deleteFolderContents(`${classId}/processed/`);
        this.logger.log('✓ Post-cleanup successful (Intermediate files removed).');
    } catch (error: any) {
        this.logger.warn(`Post-cleanup warning (non-critical): ${error.message}`);
    }

    this.logger.log(`=== FULL WORKFLOW COMPLETE FOR ${classId} ===`);
    
    return {
       status: 'workflow_complete',
       processing: processResult,
       merging: mergeResult,
       splitting: splitResult
    };
  }

  async process(classId: string) {
    const uploadsPrefix = `${classId}/uploads/`;

    let allFiles = await this.helpers.listFiles(uploadsPrefix);

    const sourceFiles = allFiles.filter(key => 
        key.toLowerCase().endsWith('.pdf') || key.toLowerCase().endsWith('.txt')
    );

    if (!sourceFiles.length) {
         return { status: 'empty', message: `No supported files (PDF/TXT) found in ${uploadsPrefix}` };
    }

    this.logger.log(`Found ${sourceFiles.length} files. Processing in batches of ${BATCH_SIZE}...`);
    const results: any[] = [];

    for (let i = 0; i < sourceFiles.length; i += BATCH_SIZE) {
        const batch = sourceFiles.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.all(
            batch.map(fileKey => this.processSingleFile(classId, fileKey))
        );
        
        results.push(...batchResults);

        if (i + BATCH_SIZE < sourceFiles.length) {
            this.logger.log('Waiting 5 seconds between batches...');
            await this.helpers.sleep(5000);
        }
    }

    return { status: 'batch_complete', details: results };
  }

  private async processSingleFile(classId: string, fileKey: string) {
    const ext = path.extname(fileKey).toLowerCase();
    const baseName = path.basename(fileKey, ext);

    this.logger.log(`>> Processing: ${baseName} (Type: ${ext})`);

    try {
      let txtBuffer: Buffer;
      let pdfBuffer: Buffer;

      if (ext === '.txt') {
        txtBuffer = await this.helpers.getFileWithRetry(fileKey);
        pdfBuffer = Buffer.from(''); 
      } else {
        const txtKey = `${classId}/processed/${baseName}.txt`; 
        
        [txtBuffer, pdfBuffer] = await Promise.all([
           this.helpers.getFileWithRetry(txtKey),
           this.helpers.getFileWithRetry(fileKey)
        ]);
      }

      const aiOutput = await this.aiService.askGeminiWithRetry(txtBuffer, pdfBuffer);

      const finalId = Math.random().toString(36).substring(2, 10);
      const finalPdf = await this.helpers.buildPdf(aiOutput, finalId);
      const finalTxt = Buffer.from(aiOutput, 'utf-8');

      const finalPdfKey = `${classId}/final/${finalId}.pdf`;
      const finalTxtKey = `${classId}/final/${finalId}.txt`;

      await Promise.all([
          this.helpers.uploadFile(finalPdfKey, finalPdf, 'application/pdf'),
          this.helpers.uploadFile(finalTxtKey, finalTxt, 'text/plain; charset=utf-8')
      ]);

      this.logger.log(`<< Success: ${baseName}`);
      return { status: 'success', baseName };

    } catch (error: any) {
      this.logger.error(`!! Failed: ${baseName}: ${error.message}`);
      return { status: 'error', baseName, error: error.message };
    }
  }

  async mergeFinalPdfsS3(classId: string) {
    const rootFolderPrefix = `${classId}/`;
    const finalSubfolderPrefix = `${rootFolderPrefix}final/`;

    this.logger.log(`Listing files to merge from: ${finalSubfolderPrefix}`);

    const allFiles = await this.helpers.listFiles(finalSubfolderPrefix);
    const s3PdfFiles = allFiles.filter(key => key.endsWith('.pdf'));

    if (!s3PdfFiles.length) {
      return { status: 'empty', message: `No PDFs found in ${finalSubfolderPrefix} to merge.` };
    }

    this.logger.log(`Found ${s3PdfFiles.length} PDF files (anchors) to merge. Extracting content...`);

    let allTextContent = '';
    
    const textContents = await Promise.all(s3PdfFiles.map(async (pdfKey) => {
        try {
            const txtKey = pdfKey.replace('.pdf', '.txt');
            const txtBuffer = await this.helpers.getFile(txtKey);
            return `\n\n=== CONTENT FROM PART ${path.basename(pdfKey, '.pdf')} ===\n${txtBuffer.toString()}`;
        } catch (error) {
            this.logger.error(`Error getting text content for ${pdfKey}:`, error);
            return '';
        }
    }));

    allTextContent = textContents.join('');

    if (!allTextContent.trim()) {
      return { status: 'error', message: 'No text content found to merge.' };
    }

    const mergedContent = await this.aiService.askGeminiToMerge(allTextContent);

    const mergeId = Math.random().toString(36).substring(2, 10);
    const finalPdfBuffer = await this.helpers.buildPdf(mergedContent, mergeId);
    const finalTxtBuffer = Buffer.from(mergedContent, 'utf-8');
    
    const finalPdfKey = `${rootFolderPrefix}Final_Merged_${classId}.pdf`;
    const finalTxtKey = `${rootFolderPrefix}Final_Merged_${classId}.txt`;

    // KRYTYCZNE: Upload PRZED delete, aby zapobiec utracie danych przy błędzie
    this.logger.log(`Uploading final merged files...`);
    await Promise.all([
        this.helpers.uploadFile(finalPdfKey, finalPdfBuffer, 'application/pdf'),
        this.helpers.uploadFile(finalTxtKey, finalTxtBuffer, 'text/plain; charset=utf-8')
    ]);

    // Dopiero po sukcesie uploadu - cleanup intermediate files
    this.logger.log(`Cleaning up intermediate AI files...`);
    try {
      await this.helpers.deleteFolderContents(finalSubfolderPrefix);
    } catch (cleanupError: any) {
      // Nie blokujemy sukcesu operacji, jeśli cleanup zawiedzie (pliki zostają, ale merged jest OK)
      this.logger.warn(`Cleanup warning (non-critical): ${cleanupError.message}`);
    }

    return {
      status: 'ok',
      message: 'Merge complete. Intermediate AI files deleted.',
      finalPdfKey,
      finalTxtKey
    };
  }

  async splitMergedPdf(classId: string) {
    const rootFolderPrefix = `${classId}/`;
    const mergedTxtKey = `${rootFolderPrefix}Final_Merged_${classId}.txt`;

    this.logger.log(`Attempting to split topics from: ${mergedTxtKey}`);

    let fullText = '';
    try {
      const buffer = await this.helpers.getFile(mergedTxtKey);
      fullText = buffer.toString('utf-8');
    } catch (error) {
      this.logger.error(`Could not find merged text file: ${mergedTxtKey}`);
      throw new Error('Merged text file not found. Please run merge first.');
    }

    const lines = fullText.split('\n');
    
    const rawTopics: { 
        number: string; 
        content: string; 
        name: string;
    }[] = [];
    
    let currentTopicNumber = 0; 
    let currentTopicString = ''; 
    let currentTopicName = '';
    let currentContent: string[] = [];
    let isInsideLiterature = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)\.\s+(.*)/); 

      if (match) {
        const foundNumber = parseInt(match[1]!, 10);
        const topicTitle = match[2]!.trim();
        const isSequenceReset = foundNumber < currentTopicNumber;
        const isNextTopic = foundNumber === currentTopicNumber + 1;

        if (isSequenceReset || (isInsideLiterature && !isNextTopic)) {
            currentContent.push(line.replace('.', ')'));
            continue;
        }

        if (currentTopicString) {
          rawTopics.push({
            number: currentTopicString,
            content: currentContent.join('\n'),
            name: currentTopicName || `Topic ${currentTopicString}`
          });
        }

        currentTopicNumber = foundNumber;
        currentTopicString = match[1]!;
        currentTopicName = topicTitle;
        currentContent = [];

      } else {
        if (currentTopicString) currentContent.push(line);
      }
    }

    if (currentTopicString && currentContent.length > 0) {
        rawTopics.push({ 
            number: currentTopicString, 
            content: currentContent.join('\n'),
            name: currentTopicName
        });
    }

    const nameTracker = new Map<string, number>();
    const finalTopics = rawTopics.map((t) => {
        let uniqueName = t.name;
        if (nameTracker.has(uniqueName)) {
            const count = nameTracker.get(uniqueName)! + 1;
            nameTracker.set(uniqueName, count);
            uniqueName = `${uniqueName} (${count})`;
        } else {
            nameTracker.set(uniqueName, 1);
        }
        return { ...t, name: uniqueName };
    });

    const generatedFiles: string[] = [];
    const topicEntities: Topic[] = [];
    
    try {
      this.logger.log(`Generating PDFs and uploading to S3...`);

      // 1. Najpierw generujemy i uploadujemy WSZYSTKIE pliki do S3.
      // Jeśli cokolwiek tutaj zawiedzie, nie dotykamy bazy danych.
      const uploadPromises = finalTopics.map(async (topic) => {
        const newTopicId = randomUUID(); 
        const fileName = `${newTopicId}.pdf`; 
        const finalKey = `${rootFolderPrefix}${fileName}`;
        
        const pdfBuffer = await this.helpers.buildPdf(topic.content, newTopicId);
        await this.helpers.uploadFile(finalKey, pdfBuffer, 'application/pdf');
        
        generatedFiles.push(finalKey); // Zbieramy klucze, żeby je usunąć w razie rollbacku
        
        // Przygotowujemy encję (ale jeszcze nie zapisujemy)
        const newTopic = this.topicsRepo.create({
            topicID: newTopicId,         
            name: topic.name,         
            class: { classID: classId } as any,
        });
        topicEntities.push(newTopic);
      });

      await Promise.all(uploadPromises);

      // 2. Operacje na bazie danych - Repository handles transaction
      this.logger.log(`Updating database topics for class ${classId}...`);
      const savedTopics = await this.topicsRepo.replaceTopicsForClassTransactional(
        classId,
        topicEntities
      );

      this.logger.log(`Successfully split and saved ${savedTopics.length} new topics.`);

      // 3. Cleanup (po sukcesie)
      this.logger.log('Deleting merged TXT file...');
      await this.helpers.deleteFile(mergedTxtKey);

      return {
          status: 'ok',
          message: `Split done. Topics saved using UUIDs as filenames.`,
          files: generatedFiles
      };

    } catch (error) {
      this.logger.error(`Split failed. Error: ${error}`);

      // Cleanup S3: Musimy posprzątać pliki, które udało się wgrać, bo baza ich nie widzi
      this.logger.log('Cleaning up orphaned S3 files due to failure...');
      for (const key of generatedFiles) {
          await this.helpers.deleteFile(key).catch(e => this.logger.warn(`Failed to delete orphan ${key}: ${e}`));
      }

      throw error;
    }
  }
  
  async checkStatus(classId: string) {
    const topicCount = await this.topicsRepo.countByClassId(classId);

    if (topicCount === 0) {
        return { isComplete: false, reason: 'No topics generated yet' };
    }

    const finalMergedKey = `${classId}/Final_Merged_${classId}.pdf`;
    const hasMergedPdf = await this.helpers.checkFileExists(finalMergedKey);

    if (!hasMergedPdf) {
        return { isComplete: false, reason: 'Final merged PDF missing' };
    }

    const uploadsPrefix = `${classId}/uploads/`;
    const hasUploads = await this.helpers.isFolderNotEmpty(uploadsPrefix);
    return { 
        isComplete: true, 
        stats: {
            topicsCount: topicCount,
            hasMergedPdf: true,
            hasUploads: true
        }
    };
  }
}