import { Injectable, Logger } from '@nestjs/common';
import { ProcessingHelpers } from './helpers/processing.helpers';
import * as path from 'path';
import { ProcessingAi } from './helpers/processing.ai';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Topic } from '@repo/database';
import { randomUUID } from 'crypto';

const BATCH_SIZE = 3;

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly helpers: ProcessingHelpers,
    private readonly aiService: ProcessingAi,
    @InjectRepository(Topic) 
    private topicsRepository: Repository<Topic>,
  ) {}

  async executeFullWorkflow(classId: string) {
    this.logger.log(`=== STARTING FULL WORKFLOW FOR CLASS ID: ${classId} ===`);

    const processResult = await this.process(classId);
    if (processResult.status === 'empty' || processResult.status === 'error') {
       return { step: 'process', error: processResult.message };
    }

    const mergeResult = await this.mergeFinalPdfsS3(classId);
    if (mergeResult.status === 'error') {
       return { step: 'merge', error: mergeResult.message };
    }
    const splitResult = await this.splitMergedPdf(classId);

    // === CLEANUP SECTION ===
    this.logger.log(`Work complete. cleaning up intermediate files for ${classId}...`);
    try {
        await this.helpers.deleteFolderContents(`${classId}/processed/`);
        this.logger.log('Cleanup successful (Intermediate files removed).');
    } catch (error: any) {
        this.logger.warn(`Cleanup failed (non-critical): ${error.message}`);
    }

    this.logger.log(`=== FULL WORKFLOW COMPLETE FOR ${classId} ===`);
    
    return {
       status: 'workflow_complete',
       processing: processResult,
       merging: mergeResult,
       splitting: splitResult
    };
  }

  // =========================================================================
  // === FILE PROCESSING ===
  // =========================================================================
  async process(classId: string) {
    const uploadsPrefix = `${classId}/uploads/`;

    const s3PdfFiles = await this.helpers.listPdfFiles(uploadsPrefix);

    if (!s3PdfFiles.length) {
         return { status: 'empty', message: `No PDF files found in ${uploadsPrefix}` };
    }

    this.logger.log(`Found ${s3PdfFiles.length} files. Processing in batches of ${BATCH_SIZE}...`);
    const results: any[] = [];

    // Loop through files in chunks (Batches)
    for (let i = 0; i < s3PdfFiles.length; i += BATCH_SIZE) {
        const batch = s3PdfFiles.slice(i, i + BATCH_SIZE);
        
        // Process current batch in parallel
        const batchResults = await Promise.all(
            batch.map(pdfKey => this.processSingleFile(classId, pdfKey))
        );
        
        results.push(...batchResults);

        if (i + BATCH_SIZE < s3PdfFiles.length) {
            this.logger.log('Waiting 5 seconds between batches...');
            await this.helpers.sleep(5000);
        }
    }

    return { status: 'batch_complete', details: results };
  }

  private async processSingleFile(classId: string, pdfKey: string) {
    const baseName = path.basename(pdfKey, '.pdf');
    const txtKey = `${classId}/processed/${baseName}.txt`; 

    this.logger.log(`>> Processing: ${baseName}`);

    try {
      const [txtBuffer, pdfBuffer] = await Promise.all([
         this.helpers.getFileWithRetry(txtKey),
         this.helpers.getFileWithRetry(pdfKey)
      ]);

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

  // =========================================================================
  // === FILE MERGING ===
  // =========================================================================
  async mergeFinalPdfsS3(classId: string) {
    const rootFolderPrefix = `${classId}/`;
    const finalSubfolderPrefix = `${rootFolderPrefix}final/`;

    this.logger.log(`Listing files to merge from: ${finalSubfolderPrefix}`);

    const s3PdfFiles = await this.helpers.listPdfFiles(finalSubfolderPrefix);

    if (!s3PdfFiles.length) {
      return { status: 'empty', message: `No PDFs found in ${finalSubfolderPrefix} to merge.` };
    }

    this.logger.log(`Found ${s3PdfFiles.length} files. Extracting content...`);

    let allTextContent = '';
    
    // Parallel download of text content for speed
    const textContents = await Promise.all(s3PdfFiles.map(async (pdfKey) => {
        try {
            const txtKey = pdfKey.replace('.pdf', '.txt');
            const txtBuffer = await this.helpers.getFile(txtKey);
            return `\n\n=== CONTENT FROM ${path.basename(pdfKey)} ===\n${txtBuffer.toString()}`;
        } catch (error) {
            this.logger.error(`Error getting text content from ${pdfKey}:`, error);
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

    // 1. Delete the "final/" subfolder
    this.logger.log(`Cleaning up intermediate AI files...`);
    await this.helpers.deleteFolderContents(finalSubfolderPrefix); 

    this.logger.log(`Uploading final merged files...`);
    await Promise.all([
        this.helpers.uploadFile(finalPdfKey, finalPdfBuffer, 'application/pdf'),
        this.helpers.uploadFile(finalTxtKey, finalTxtBuffer, 'text/plain; charset=utf-8')
    ]);

    return {
      status: 'ok',
      message: 'Merge complete. Intermediate AI files deleted.',
      finalPdfKey,
      finalTxtKey
    };
  }

  // =========================================================================
  // === SPLIT MERGE FILES ===
  // =========================================================================
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
    
    // Intermediate storage for parsed topics
    const rawTopics: { 
        number: string; 
        content: string; 
        name: string;
    }[] = [];
    
    let currentTopicNumber = 0; 
    let currentTopicString = ''; 
    let currentTopicName = '';
    let currentContent: string[] = [];
    const literatureKeywords = ['bibliografia', 'literatura', 'źródła', 'wykaz', 'references', 'bibliography'];
    let isInsideLiterature = false;

    // 1. PARSE TEXT INTO RAW TOPICS
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

    // Push the last topic
    if (currentTopicString && currentContent.length > 0) {
        rawTopics.push({ 
            number: currentTopicString, 
            content: currentContent.join('\n'),
            name: currentTopicName
        });
    }

    // 2. DEDUPLICATE NAMES (The Fix)
    const nameTracker = new Map<string, number>();
    const finalTopics = rawTopics.map((t) => {
        let uniqueName = t.name;
        // If this name has been seen before, append a counter
        if (nameTracker.has(uniqueName)) {
            const count = nameTracker.get(uniqueName)! + 1;
            nameTracker.set(uniqueName, count);
            uniqueName = `${uniqueName} (${count})`;
        } else {
            nameTracker.set(uniqueName, 1);
        }
        return { ...t, name: uniqueName };
    });

    // 3. GENERATE FILES & DB ENTITIES
    const generatedFiles: string[] = [];
    const topicEntities: Topic[] = [];

    this.logger.log(`Cleaning up old topics for class ${classId}...`);
    // Note: This delete might fail if foreign keys exist elsewhere, handle with care in prod
    await this.topicsRepository.delete({ class: { classID: classId } as any });

    const uploadPromises = finalTopics.map(async (topic) => {
      // Generate UUID
      const newTopicId = randomUUID(); 

      // Filename for S3
      const fileName = `${newTopicId}.pdf`; 
      const finalKey = `${rootFolderPrefix}${fileName}`;
      
      // Generate PDF
      const pdfBuffer = await this.helpers.buildPdf(topic.content, newTopicId);
      await this.helpers.uploadFile(finalKey, pdfBuffer, 'application/pdf');
      generatedFiles.push(finalKey);
      
      const newTopic = this.topicsRepository.create({
          topicID: newTopicId,         
          name: topic.name,  // Now guaranteed unique          
          class: { classID: classId } as any,
      });
      
      topicEntities.push(newTopic);
    });

    await Promise.all(uploadPromises);
    
    if (topicEntities.length > 0) {
        await this.topicsRepository.save(topicEntities);
        this.logger.log(`Successfully saved ${topicEntities.length} new topics.`);
    }

    this.logger.log('Deleting merged TXT file...');
    await this.helpers.deleteFile(mergedTxtKey);

    return {
        status: 'ok',
        message: `Split done. Topics saved using UUIDs as filenames.`,
        files: generatedFiles
    };
  }
  
  async checkStatus(classId: string) {
    // 1. Check if Topic Entities exist in DB
    const topicCount = await this.topicsRepository.count({ 
        where: { class: { classID: classId } as any } 
    });

    if (topicCount === 0) {
        return { isComplete: false, reason: 'No topics generated yet' };
    }

    // 2. Check S3: Final Merged PDF must exist
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