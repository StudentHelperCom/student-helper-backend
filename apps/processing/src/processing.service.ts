import { Injectable, Logger } from '@nestjs/common';
import { ProcessingHelpers } from './helpers/processing.helpers';
import * as path from 'path';
import { ProcessingAi } from './helpers/processing.ai';

// Batch size 3 is efficient for multitasking without hitting limits instantly
const BATCH_SIZE = 3;

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly helpers: ProcessingHelpers,
    private readonly aiService: ProcessingAi
  ) {}

  async executeFullWorkflow(classId: string) {
    this.logger.log(`=== STARTING FULL WORKFLOW FOR CLASS ID: ${classId} ===`);

    // Step 1: Run AI Processing (Multitasking)
    const processResult = await this.process(classId);
    if (processResult.status === 'empty' || processResult.status === 'error') {
       return { step: 'process', error: processResult.message };
    }

    // Step 2: Merge the processed files
    const mergeResult = await this.mergeFinalPdfsS3(classId);
    if (mergeResult.status === 'error') {
       return { step: 'merge', error: mergeResult.message };
    }

    // Step 3: Split the merged file into final topics
    const splitResult = await this.splitMergedPdf(classId);

    // === STEP 4: CLEANUP ===
    this.logger.log(`Work complete. Deleting source folders for ${classId}...`);
    try {
        await this.helpers.deleteFolderContents(`${classId}/uploads/`);
        await this.helpers.deleteFolderContents(`${classId}/processed/`);
        this.logger.log('Cleanup successful.');
    } catch (error) {
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

  // -------------------------------------------------------------------------
  // 1. Process the uploaded file (Multitasking Implemented)
  // -------------------------------------------------------------------------
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

        // Safety delay between batches to respect rate limits
        if (i + BATCH_SIZE < s3PdfFiles.length) {
            this.logger.log('Waiting 5 seconds between batches...');
            await this.helpers.sleep(5000);
        }
    }

    return { status: 'batch_complete', details: results };
  }

  // Helper for processing a single file
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

    } catch (error) {
      this.logger.error(`!! Failed: ${baseName}: ${error.message}`);
      return { status: 'error', baseName, error: error.message };
    }
  }

  // -------------------------------------------------------------------------
  // 2. Merge All Final PDFs 
  // -------------------------------------------------------------------------
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

    // 1. Delete the "final/" subfolder (Individual AI summaries)
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

  // -------------------------------------------------------------------------
  // 3. Split Merged TXT into Topic PDFs 
  // -------------------------------------------------------------------------
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
    const topics: { number: string; content: string }[] = [];
    
    let currentTopicNumber = 0; 
    let currentTopicString = ''; 
    let currentContent: string[] = [];
    const literatureKeywords = ['bibliografia', 'literatura', 'źródła', 'wykaz', 'references', 'bibliography'];
    let isInsideLiterature = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+)\.\s+(.*)/);

      if (match) {
        const foundNumber = parseInt(match[1], 10);
        const topicTitle = match[2].toLowerCase();
        const isSequenceReset = foundNumber < currentTopicNumber;
        const isNextTopic = foundNumber === currentTopicNumber + 1;

        if (isSequenceReset || (isInsideLiterature && !isNextTopic)) {
             currentContent.push(line.replace('.', ')'));
             continue; 
        }

        if (currentTopicString) topics.push({ number: currentTopicString, content: currentContent.join('\n') });

        currentTopicNumber = foundNumber;
        currentTopicString = match[1];
        currentContent = [trimmed]; 
        isInsideLiterature = literatureKeywords.some(keyword => topicTitle.includes(keyword));

      } else {
        if (currentTopicString) currentContent.push(line);
      }
    }

    if (currentTopicString && currentContent.length > 0) {
        topics.push({ number: currentTopicString, content: currentContent.join('\n') });
    }

    const generatedFiles: string[] = [];
    
    // Parallel upload of split files
    const uploadPromises = topics.map(async (topic) => {
        const pdfBuffer = await this.helpers.buildPdf(topic.content, 'temp');
        const fileName = `t${topic.number}.pdf`;
        const finalKey = `${rootFolderPrefix}${fileName}`;
        await this.helpers.uploadFile(finalKey, pdfBuffer, 'application/pdf');
        generatedFiles.push(finalKey);
    });

    await Promise.all(uploadPromises);

    this.logger.log('Deleting merged TXT file (keeping PDF)...');
    await this.helpers.deleteFile(mergedTxtKey);

    return {
        status: 'ok',
        message: `Split into ${generatedFiles.length} files. Merged TXT deleted.`,
        files: generatedFiles
    };
  }
}





