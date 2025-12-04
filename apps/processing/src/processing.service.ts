import { Injectable, Logger } from '@nestjs/common';
import { ProcessingHelpers } from './helpers/processing.helpers';
import * as path from 'path';
import { ProcessingAi } from './helpers/processing.ai';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  // === CONSTRUCTOR INJECTION ===
  constructor(
    private readonly helpers: ProcessingHelpers,
    private readonly aiService: ProcessingAi
  ) {}

  async executeFullWorkflow(userId: string, className: string) {
    this.logger.log(`=== STARTING FULL WORKFLOW FOR ${className} ===`);

    // Step 1: Run AI Processing (Batch)
    const processResult = await this.process(userId, className);
    if (processResult.status === 'empty' || processResult.status === 'error') {
       return { step: 'process', error: processResult.message };
    }

    // Step 2: Merge the processed files
    const mergeResult = await this.mergeFinalPdfsS3(userId, className);
    if (mergeResult.status === 'error') {
        return { step: 'merge', error: mergeResult.message };
    }

    // Step 3: Split the merged file into final topics
    const splitResult = await this.splitMergedPdf(userId, className);

    this.logger.log(`=== FULL WORKFLOW COMPLETE FOR ${className} ===`);
    
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
  async process(userId: string, className: string) {
    // USE HELPER
    const safeClassName = this.helpers.sanitizeFilename(className).replace(/\.[^/.]+$/, "");
    const uploadsPrefix = `${userId}/${safeClassName}/uploads/`;

    // USE HELPER (Make sure you added the listPdfFiles method I showed in Step 2)
    const s3PdfFiles = await this.helpers.listPdfFiles(uploadsPrefix);

    if (!s3PdfFiles.length) {
         return { status: 'empty', message: `No PDF files found in ${uploadsPrefix}` };
    }

    const results: any[] = [];

    for (const pdfKey of s3PdfFiles) {
       const baseName = path.basename(pdfKey, '.pdf');
       const txtKey = `${userId}/${safeClassName}/processed/${baseName}.txt`; 

       this.logger.log(`Processing file: ${baseName}`);

       try {
         // USE HELPER
         const txtBuffer = await this.helpers.getFileWithRetry(txtKey); 
         const pdfBuffer = await this.helpers.getFileWithRetry(pdfKey);

         // USE HELPER
         const aiOutput = await this.aiService.askGeminiWithRetry(txtBuffer, pdfBuffer);

         const finalId = Math.random().toString(36).substring(2, 10);
         // USE HELPER
         const finalPdf = await this.helpers.buildPdf(aiOutput, finalId);
         const finalTxt = Buffer.from(aiOutput, 'utf-8');

         const finalPdfKey = `${userId}/${safeClassName}/final/${finalId}.pdf`;
         const finalTxtKey = `${userId}/${safeClassName}/final/${finalId}.txt`;

         // USE HELPER
         await this.helpers.uploadFile(finalPdfKey, finalPdf, 'application/pdf');
         await this.helpers.uploadFile(finalTxtKey, finalTxt, 'text/plain; charset=utf-8');

         results.push({ status: 'success', baseName });

         this.logger.log('Cooling down network for 2 seconds...');
         // USE HELPER
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
  async mergeFinalPdfsS3(userId: string, className: string) {
    const safeClassName = this.helpers.sanitizeFilename(className).replace(/\.[^/.]+$/, "");
    const rootFolderPrefix = `${userId}/${safeClassName}/`;
    const finalSubfolderPrefix = `${rootFolderPrefix}final/`;

    this.logger.log(`Listing files to merge from: ${finalSubfolderPrefix}`);

    // USE HELPER
    const s3PdfFiles = await this.helpers.listPdfFiles(finalSubfolderPrefix);

    if (!s3PdfFiles.length) {
      return { status: 'empty', message: `No PDFs found in ${finalSubfolderPrefix} to merge.` };
    }

    this.logger.log(`Found ${s3PdfFiles.length} files. Extracting content...`);

    let allTextContent = '';
    
    for (const pdfKey of s3PdfFiles) {
      try {
        const txtKey = pdfKey.replace('.pdf', '.txt');
        // USE HELPER
        const txtBuffer = await this.helpers.getFile(txtKey);
        const content = txtBuffer.toString();
        allTextContent += `\n\n=== CONTENT FROM ${path.basename(pdfKey)} ===\n${content}`;
      } catch (error) {
        this.logger.error(`Error getting text content from ${pdfKey}:`, error);
      }
    }

    if (!allTextContent.trim()) {
      return { status: 'error', message: 'No text content found to merge.' };
    }

    // USE HELPER
    const mergedContent = await this.aiService.askGeminiToMerge(allTextContent);

    // Prepare Final Files
    const mergeId = Math.random().toString(36).substring(2, 10);
    const finalPdfBuffer = await this.helpers.buildPdf(mergedContent, mergeId);
    const finalTxtBuffer = Buffer.from(mergedContent, 'utf-8');
    
    const finalPdfKey = `${rootFolderPrefix}Final_Merged_${safeClassName}.pdf`;
    const finalTxtKey = `${rootFolderPrefix}Final_Merged_${safeClassName}.txt`;

    this.logger.log(`Cleaning up all files in ${rootFolderPrefix}...`);
    // USE HELPER
    await this.helpers.deleteFolderContents(rootFolderPrefix);

    this.logger.log(`Uploading final merged files...`);
    await this.helpers.uploadFile(finalPdfKey, finalPdfBuffer, 'application/pdf');
    await this.helpers.uploadFile(finalTxtKey, finalTxtBuffer, 'text/plain; charset=utf-8');

    return {
      status: 'ok',
      message: 'Merge complete. Cleanup done. Created PDF and TXT.',
      finalPdfKey: finalPdfKey,
      finalTxtKey: finalTxtKey
    };
  }

  // -------------------------------------------------------------------------
  // 3. Split Merged TXT into Topic PDFs 
  // -------------------------------------------------------------------------
  async splitMergedPdf(userId: string, className: string) {
    const safeClassName = this.helpers.sanitizeFilename(className).replace(/\.[^/.]+$/, "");
    const rootFolderPrefix = `${userId}/${safeClassName}/`;
    
    const mergedTxtKey = `${rootFolderPrefix}Final_Merged_${safeClassName}.txt`;

    this.logger.log(`Attempting to split topics from: ${mergedTxtKey}`);

    let fullText = '';
    try {
      // USE HELPER
      const buffer = await this.helpers.getFile(mergedTxtKey);
      fullText = buffer.toString('utf-8');
    } catch (error) {
      this.logger.error(`Could not find merged text file: ${mergedTxtKey}`);
      throw new Error('Merged text file not found. Please run merge first.');
    }

    // --- LOGIC START (This logic stays in the service as it's specific business logic) ---
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
             const maskedLine = line.replace('.', ')');
             currentContent.push(maskedLine);
             continue; 
        }

        if (currentTopicString) {
            topics.push({ number: currentTopicString, content: currentContent.join('\n') });
        }

        currentTopicNumber = foundNumber;
        currentTopicString = match[1];
        currentContent = [trimmed]; 
        isInsideLiterature = literatureKeywords.some(keyword => topicTitle.includes(keyword));

      } else {
        if (currentTopicString) {
            currentContent.push(line);
        }
      }
    }

    if (currentTopicString && currentContent.length > 0) {
        topics.push({ number: currentTopicString, content: currentContent.join('\n') });
    }
    // --- LOGIC END ---

    this.logger.log(`Found ${topics.length} actual topics to generate.`);

    const generatedFiles: string[] = [];

    for (const topic of topics) {
        // USE HELPER
        const pdfBuffer = await this.helpers.buildPdf(topic.content, 'temp');
        const fileName = `t${topic.number}.pdf`;
        const finalKey = `${rootFolderPrefix}${fileName}`;

        await this.helpers.uploadFile(finalKey, pdfBuffer, 'application/pdf');
        generatedFiles.push(finalKey);
    }

    this.logger.log('Deleting merged TXT file (keeping PDF)...');
    
    // USE HELPER
    await this.helpers.deleteFile(mergedTxtKey);

    return {
        status: 'ok',
        message: `Split into ${generatedFiles.length} files. Merged TXT deleted.`,
        files: generatedFiles
    };
  }
}