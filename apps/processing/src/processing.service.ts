import { Injectable, Logger } from '@nestjs/common';
import { ProcessingHelpers } from './helpers/processing.helpers';
import * as path from 'path';
import { ProcessingAi } from './helpers/processing.ai';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly helpers: ProcessingHelpers,
    private readonly aiService: ProcessingAi
  ) {}

  async executeFullWorkflow(classId: string) {
    this.logger.log(`=== STARTING FULL WORKFLOW FOR CLASS ID: ${classId} ===`);

    // Step 1: Run AI Processing (Batch)
    // Reads from 'uploads/' -> Writes to 'final/'
    const processResult = await this.process(classId);
    if (processResult.status === 'empty' || processResult.status === 'error') {
       return { step: 'process', error: processResult.message };
    }

    // Step 2: Merge the processed files
    // Reads from 'final/' -> Writes 'Final_Merged.pdf' to root
    const mergeResult = await this.mergeFinalPdfsS3(classId);
    if (mergeResult.status === 'error') {
       return { step: 'merge', error: mergeResult.message };
    }

    // Step 3: Split the merged file into final topics
    // Reads 'Final_Merged.txt' -> Writes 't1.pdf', 't2.pdf' to root
    const splitResult = await this.splitMergedPdf(classId);

    // === STEP 4: CLEANUP ===
    // Now that we have the final result, we delete the source files
    this.logger.log(`Work complete. Deleting source folders for ${classId}...`);
    
    try {
        await this.helpers.deleteFolderContents(`${classId}/uploads/`);
        await this.helpers.deleteFolderContents(`${classId}/processed/`);
        // Note: mergeFinalPdfsS3 already cleaned up 'final/'
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
  // 1. Process the uploaded file
  // -------------------------------------------------------------------------
  async process(classId: string) {
    const uploadsPrefix = `${classId}/uploads/`;

    const s3PdfFiles = await this.helpers.listPdfFiles(uploadsPrefix);

    if (!s3PdfFiles.length) {
         return { status: 'empty', message: `No PDF files found in ${uploadsPrefix}` };
    }

    const results: any[] = [];

    for (const pdfKey of s3PdfFiles) {
       const baseName = path.basename(pdfKey, '.pdf');
       const txtKey = `${classId}/processed/${baseName}.txt`; 

       this.logger.log(`Processing file: ${baseName}`);

       try {
         const txtBuffer = await this.helpers.getFileWithRetry(txtKey); 
         const pdfBuffer = await this.helpers.getFileWithRetry(pdfKey);

         const aiOutput = await this.aiService.askGeminiWithRetry(txtBuffer, pdfBuffer);

         const finalId = Math.random().toString(36).substring(2, 10);
         const finalPdf = await this.helpers.buildPdf(aiOutput, finalId);
         const finalTxt = Buffer.from(aiOutput, 'utf-8');

         const finalPdfKey = `${classId}/final/${finalId}.pdf`;
         const finalTxtKey = `${classId}/final/${finalId}.txt`;

         await this.helpers.uploadFile(finalPdfKey, finalPdf, 'application/pdf');
         await this.helpers.uploadFile(finalTxtKey, finalTxt, 'text/plain; charset=utf-8');

         results.push({ status: 'success', baseName });

         this.logger.log('Cooling down network for 2 seconds...');
         await this.helpers.sleep(2000); 

       } catch (error) {
         this.logger.error(`Failed to process ${baseName}: ${error.message}`);
         results.push({ status: 'error', baseName, error: error.message });
         await this.helpers.sleep(2000);
       }
    }

    return { status: 'batch_complete', details: results };
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
    
    for (const pdfKey of s3PdfFiles) {
      try {
        const txtKey = pdfKey.replace('.pdf', '.txt');
        const txtBuffer = await this.helpers.getFile(txtKey);
        allTextContent += `\n\n=== CONTENT FROM ${path.basename(pdfKey)} ===\n${txtBuffer.toString()}`;
      } catch (error) {
        this.logger.error(`Error getting text content from ${pdfKey}:`, error);
      }
    }

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
    await this.helpers.uploadFile(finalPdfKey, finalPdfBuffer, 'application/pdf');
    await this.helpers.uploadFile(finalTxtKey, finalTxtBuffer, 'text/plain; charset=utf-8');

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

    for (const topic of topics) {
        const pdfBuffer = await this.helpers.buildPdf(topic.content, 'temp');
        const fileName = `t${topic.number}.pdf`;
        const finalKey = `${rootFolderPrefix}${fileName}`;

        await this.helpers.uploadFile(finalKey, pdfBuffer, 'application/pdf');
        generatedFiles.push(finalKey);
    }

    this.logger.log('Deleting merged TXT file (keeping PDF)...');
    await this.helpers.deleteFile(mergedTxtKey);

    return {
        status: 'ok',
        message: `Split into ${generatedFiles.length} files. Merged TXT deleted.`,
        files: generatedFiles
    };
  }
}