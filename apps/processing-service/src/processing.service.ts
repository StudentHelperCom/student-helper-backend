import { Injectable, Logger } from '@nestjs/common';
import { ProcessingHelpers } from './helpers/processing.helpers';
import * as path from 'path';
import { ProcessingAi } from './helpers/processing.ai';
import { randomUUID } from 'crypto';
import { TopicsRepository } from '@repo/database';
import { Topic } from '@repo/database';

const BATCH_SIZE = 3;

// Interface for our status file stored in S3
interface ProcessingStatus {
  state: 'processing' | 'completed' | 'partial_error' | 'failed';
  timestamp: string;
  details?: any;
}

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  constructor(
    private readonly helpers: ProcessingHelpers,
    private readonly aiService: ProcessingAi,
    private readonly topicsRepo: TopicsRepository
  ) {}

  // --- NEW HELPER: Update Status Marker in S3 ---
  private async updateStatusMarker(classId: string, state: ProcessingStatus['state'], details?: any) {
    const statusKey = `${classId}/status.json`;
    const statusData: ProcessingStatus = {
        state,
        timestamp: new Date().toISOString(),
        details
    };
    try {
        await this.helpers.uploadFile(
            statusKey, 
            Buffer.from(JSON.stringify(statusData), 'utf-8'), 
            'application/json'
        );
    } catch (e) {
        this.logger.warn(`Failed to update status marker: ${e}`);
    }
  }
  // ----------------------------------------------

  async executeFullWorkflow(classId: string) {
    this.logger.log(`[Workflow] Starting execution for class ID: ${classId}`);
    
    // 1. Mark as PROCESSING start
    await this.updateStatusMarker(classId, 'processing');

    this.logger.log(`[Workflow] Ensuring clean state (final folder) for ${classId}`);
    try {
        await this.helpers.deleteFolderContents(`${classId}/final/`);
    } catch (e) {
        this.logger.warn(`[Workflow] Pre-cleanup warning: ${e}`);
    }

    let processResult;
    try {
      this.logger.log(`[Step 1] Starting batch processing...`);
      processResult = await this.process(classId);
      
      if (processResult.status !== 'batch_complete' && processResult.status !== 'partial_error') {
         // Critical failure in processing logic
         const msg = `[Step 1] Failed. Status: ${processResult.status}. Msg: ${processResult.message}`;
         this.logger.error(msg);
         await this.updateStatusMarker(classId, 'failed', { error: msg });
         return { step: 'process', status: 'failed', error: processResult.message };
      }
      this.logger.log(`[Step 1] Completed. Status: ${processResult.status}`);
    } catch (error: any) {
      this.logger.error(`[Step 1] Exception: ${error.message}`);
      await this.updateStatusMarker(classId, 'failed', { error: error.message });
      return { step: 'process', status: 'failed', error: error.message };
    }

    let mergeResult;
    try {
      this.logger.log(`[Step 2] Starting merge...`);
      mergeResult = await this.mergeFinalPdfsS3(classId);
      if (mergeResult.status === 'error') {
         const msg = `[Step 2] Failed: ${mergeResult.message}`;
         this.logger.error(msg);
         await this.updateStatusMarker(classId, 'failed', { error: msg });
         return { step: 'merge', status: 'failed', error: mergeResult.message };
      }
      this.logger.log(`[Step 2] Completed successfully.`);
    } catch (error: any) {
      this.logger.error(`[Step 2] Exception: ${error.message}`);
      await this.updateStatusMarker(classId, 'failed', { error: error.message });
      return { step: 'merge', status: 'failed', error: error.message };
    }

    let splitResult;
    try {
      this.logger.log(`[Step 3] Starting split...`);
      splitResult = await this.splitMergedPdf(classId);
      this.logger.log(`[Step 3] Completed successfully.`);
    } catch (error: any) {
      this.logger.error(`[Step 3] Exception: ${error.message}`);
      await this.updateStatusMarker(classId, 'failed', { error: error.message });
      return { step: 'split', status: 'failed', error: error.message };
    }

    this.logger.log(`[Workflow] Post-execution cleanup...`);
    try {
        await this.helpers.deleteFolderContents(`${classId}/processed/`);
        this.logger.log('[Workflow] Post-cleanup successful.');
    } catch (error: any) {
        this.logger.warn(`[Workflow] Post-cleanup warning: ${error.message}`);
    }

    // Determine Final Status
    const finalState = (processResult.status === 'partial_error') ? 'partial_error' : 'completed';
    
    await this.updateStatusMarker(classId, finalState, { 
        processed: processResult.details?.length,
        topics: splitResult.files?.length
    });

    this.logger.log(`[Workflow] Execution complete for ${classId}. Final State: ${finalState}`);
    
    return {
       status: 'workflow_complete',
       finalState,
       processing: processResult,
       merging: mergeResult,
       splitting: splitResult
    };
  }

  // --- UPDATED CHECK STATUS METHOD ---
  async checkStatus(classId: string) {
    const statusKey = `${classId}/status.json`;
    
    try {
        // 1. Try to read the explicit status file from S3
        const statusBuffer = await this.helpers.getFile(statusKey);
        const statusData: ProcessingStatus = JSON.parse(statusBuffer.toString('utf-8'));

        // Logic Mapping
        switch (statusData.state) {
            case 'completed':
                return { 
                    isComplete: true, 
                    status: 'success', 
                    details: 'Workflow completed successfully.' 
                };
            case 'partial_error':
                return { 
                    isComplete: true, // It is technically "done", just not perfectly
                    status: 'partial_error', 
                    details: 'Workflow completed but some files failed to process.' 
                };
            case 'failed':
                return { 
                    isComplete: true, // It stopped running
                    status: 'failed', 
                    details: statusData.details?.error || 'Workflow failed.' 
                };
            case 'processing':
                return { 
                    isComplete: false, 
                    status: 'processing', 
                    details: 'Workflow is currently running.' 
                };
        }
    } catch (e) {
        // 2. Fallback (if status.json doesn't exist yet or was deleted)
        // We use the old logic as a backup
        const topicCount = await this.topicsRepo.countByClassId(classId);
        
        if (topicCount > 0) {
            return { isComplete: true, status: 'success', details: 'Topics found (Legacy check).' };
        }

        const uploadsPrefix = `${classId}/uploads/`;
        const hasUploads = await this.helpers.isFolderNotEmpty(uploadsPrefix);
        
        if (hasUploads) {
            return { isComplete: false, status: 'processing', details: 'Files found but no status marker.' };
        }

        return { isComplete: false, status: 'empty', details: 'No files or status found.' };
    }
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

    this.logger.log(`[Process] Found ${sourceFiles.length} files. Processing in batches of ${BATCH_SIZE}.`);
    const results: any[] = [];
    let failureCount = 0; 

    for (let i = 0; i < sourceFiles.length; i += BATCH_SIZE) {
        const batch = sourceFiles.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.all(
            batch.map(fileKey => this.processSingleFile(classId, fileKey))
        );
        
        batchResults.forEach(res => {
            if (res.status === 'error') failureCount++;
        });

        results.push(...batchResults);

        if (i + BATCH_SIZE < sourceFiles.length) {
            this.logger.log('[Process] Batch pause (5s)...');
            await this.helpers.sleep(5000);
        }
    }

    if (failureCount > 0) {
        // Return details but don't crash, allowing the workflow to proceed to Merge/Split for the files that succeeded
        return { status: 'partial_error', message: `${failureCount} files failed to process`, details: results };
    }

    return { status: 'batch_complete', details: results };
  }

  // ... (Rest of your methods: processSingleFile, mergeFinalPdfsS3, splitMergedPdf remain exactly the same)
  private async processSingleFile(classId: string, fileKey: string) {
    const ext = path.extname(fileKey).toLowerCase();
    const baseName = path.basename(fileKey, ext);

    this.logger.log(`[File] Processing file: ${baseName} (Type: ${ext})`);

    try {
      let txtBuffer: Buffer;
      let pdfBuffer: Buffer;

      if (ext === '.txt') {
        txtBuffer = await this.helpers.getFileWithRetry(fileKey);
        pdfBuffer = Buffer.from(''); 
      } else {
        const txtKey = `${classId}/processed/${baseName}.txt`; 
        
        const hasTxt = await this.helpers.checkFileExists(txtKey);
        if (!hasTxt) {
            throw new Error(`Missing processed text file: ${txtKey}. OCR result not found.`);
        }

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

      this.logger.log(`[File] Success: ${baseName}`);
      return { status: 'success', baseName };

    } catch (error: any) {
      this.logger.error(`[File] Failed: ${baseName}: ${error.message}`);
      return { status: 'error', baseName, error: error.message };
    }
  }

  async mergeFinalPdfsS3(classId: string) {
    const rootFolderPrefix = `${classId}/`;
    const finalSubfolderPrefix = `${rootFolderPrefix}final/`;

    this.logger.log(`[Merge] Listing files in: ${finalSubfolderPrefix}`);

    const allFiles = await this.helpers.listFiles(finalSubfolderPrefix);
    const s3PdfFiles = allFiles.filter(key => key.endsWith('.pdf'));

    if (!s3PdfFiles.length) {
      return { status: 'empty', message: `No PDFs found in ${finalSubfolderPrefix} to merge.` };
    }

    this.logger.log(`[Merge] Found ${s3PdfFiles.length} PDF files. Extracting content...`);

    let allTextContent = '';
    
    const textContents = await Promise.all(s3PdfFiles.map(async (pdfKey) => {
        try {
            const txtKey = pdfKey.replace('.pdf', '.txt');
            const txtBuffer = await this.helpers.getFile(txtKey);
            return `\n\n=== CONTENT FROM PART ${path.basename(pdfKey, '.pdf')} ===\n${txtBuffer.toString()}`;
        } catch (error) {
            this.logger.error(`[Merge] Error getting text content for ${pdfKey}:`, error);
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

    this.logger.log(`[Merge] Uploading final merged files...`);
    await Promise.all([
        this.helpers.uploadFile(finalPdfKey, finalPdfBuffer, 'application/pdf'),
        this.helpers.uploadFile(finalTxtKey, finalTxtBuffer, 'text/plain; charset=utf-8')
    ]);

    this.logger.log(`[Merge] Cleaning up intermediate AI files...`);
    try {
      await this.helpers.deleteFolderContents(finalSubfolderPrefix);
    } catch (cleanupError: any) {
      this.logger.warn(`[Merge] Cleanup warning: ${cleanupError.message}`);
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

    this.logger.log(`[Split] Attempting to split topics from: ${mergedTxtKey}`);

    let fullText = '';
    try {
      const buffer = await this.helpers.getFile(mergedTxtKey);
      fullText = buffer.toString('utf-8');
    } catch (error) {
      this.logger.error(`[Split] Could not find merged text file: ${mergedTxtKey}`);
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
      this.logger.log(`[Split] Generating PDFs and uploading to S3...`);

      const uploadPromises = finalTopics.map(async (topic) => {
        const newTopicId = randomUUID(); 
        const fileName = `${newTopicId}.pdf`; 
        const finalKey = `${rootFolderPrefix}${fileName}`;
        
        const pdfBuffer = await this.helpers.buildPdf(topic.content, newTopicId, topic.name);
        
        await this.helpers.uploadFile(finalKey, pdfBuffer, 'application/pdf');
        
        generatedFiles.push(finalKey);
        
        // Create topic entity for repository
        const newTopic = this.topicsRepo.create({
            topicID: newTopicId,          
            name: topic.name,          
            class: { classID: classId } as any,
        });
        topicEntities.push(newTopic);
      });

      await Promise.all(uploadPromises);

      this.logger.log(`[Split] Updating database topics for class ${classId}...`);
      
      // Use repository transactional method
      await this.topicsRepo.replaceForClass(classId, topicEntities);
      
      this.logger.log(`[Split] Successfully saved ${topicEntities.length} new topics.`);

      this.logger.log('[Split] Deleting merged TXT file...');
      await this.helpers.deleteFile(mergedTxtKey);

      return {
          status: 'ok',
          message: `Split done. Topics saved using UUIDs as filenames.`,
          files: generatedFiles
      };

    } catch (error) {
      this.logger.error(`[Split] Failed. Rolled back database. Error: ${error}`);

      this.logger.log('[Split] Cleaning up orphaned S3 files due to failure...');
      for (const key of generatedFiles) {
          await this.helpers.deleteFile(key).catch(e => this.logger.warn(`[Split] Failed to delete orphan ${key}: ${e}`));
      }

      throw error;
    }
  }
}