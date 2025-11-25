import { Injectable, Logger } from '@nestjs/common';
import { 
  S3Client, 
  GetObjectCommand, 
  PutObjectCommand, 
  ListObjectsV2Command, 
  ListObjectsV2CommandOutput, 
  DeleteObjectsCommand 
} from '@aws-sdk/client-s3';
import axios from 'axios';
import { PDFDocument, rgb } from 'pdf-lib';
import { Readable } from 'stream';
import fontkit from '@pdf-lib/fontkit';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProcessingService {
  private readonly logger = new Logger(ProcessingService.name);

  private bucket = process.env.AWS_S3_BUCKET!;
  private s3 = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  private geminiApiKey = process.env.GEMINI_API_KEY!;
  private geminiUrl = process.env.GEMINI_URL!;

  // -------------------------------------------------------------------------
  // 1. Process ALL Files in Class Folder (Batch)
  // -------------------------------------------------------------------------
  async process(userId: string, className: string) {
    const safeClassName = this.sanitizeFilename(className).replace(/\.[^/.]+$/, "");
    const uploadsPrefix = `${userId}/${safeClassName}/uploads/`;

    this.logger.log(`Starting batch processing for class: ${safeClassName}`);
    this.logger.log(`Looking for files in: ${uploadsPrefix}`);

    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: uploadsPrefix,
    });

    const res: ListObjectsV2CommandOutput = await this.s3.send(listCommand);
    const s3PdfFiles: string[] = res.Contents?.filter(obj => obj.Key?.endsWith('.pdf')).map(obj => obj.Key!) || [];

    if (!s3PdfFiles.length) {
       return { status: 'empty', message: `No PDF files found in ${uploadsPrefix}` };
    }

    this.logger.log(`Found ${s3PdfFiles.length} files to process.`);

    const results: any[] = [];

    for (const pdfKey of s3PdfFiles) {
      const baseName = path.basename(pdfKey, '.pdf');
      const txtKey = `${userId}/${safeClassName}/processed/${baseName}.txt`;

      this.logger.log(`Processing file: ${baseName}`);

      try {
        const txtBuffer = await this.getFile(txtKey);
        const pdfBuffer = await this.getFile(pdfKey);

        const aiOutput = await this.askGemini(txtBuffer, pdfBuffer);

        const finalId = Math.random().toString(36).substring(2, 10);
        const finalPdf = await this.buildPdf(aiOutput, finalId);
        const finalTxt = Buffer.from(aiOutput, 'utf-8');

        const finalPdfKey = `${userId}/${safeClassName}/final/${finalId}.pdf`;
        const finalTxtKey = `${userId}/${safeClassName}/final/${finalId}.txt`;

        await this.uploadFile(finalPdfKey, finalPdf, 'application/pdf');
        await this.uploadFile(finalTxtKey, finalTxt, 'text/plain; charset=utf-8');

        results.push({
          status: 'success',
          baseName: baseName,
          finalId: finalId,
          pdfKey: finalPdfKey
        });

      } catch (error) {
        this.logger.error(`Failed to process ${baseName}: ${error.message}`);
        results.push({
          status: 'error',
          baseName: baseName,
          error: error.message
        });
      }
    }

    return { 
      status: 'batch_complete', 
      totalProcessed: results.length,
      details: results,
      userId,
      className: safeClassName
    };
  }

  // -------------------------------------------------------------------------
  // 2. Merge All Final PDFs 
  // -------------------------------------------------------------------------
  async mergeFinalPdfsS3(userId: string, className: string) {
    const safeClassName = this.sanitizeFilename(className).replace(/\.[^/.]+$/, "");
    const rootFolderPrefix = `${userId}/${safeClassName}/`;
    const finalSubfolderPrefix = `${rootFolderPrefix}final/`;

    this.logger.log(`Listing files to merge from: ${finalSubfolderPrefix}`);

    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: finalSubfolderPrefix,
    });

    const res: ListObjectsV2CommandOutput = await this.s3.send(listCommand);
    const s3PdfFiles: string[] = res.Contents?.filter(obj => obj.Key?.endsWith('.pdf')).map(obj => obj.Key!) || [];

    if (!s3PdfFiles.length) {
      return { status: 'empty', message: `No PDFs found in ${finalSubfolderPrefix} to merge.` };
    }

    this.logger.log(`Found ${s3PdfFiles.length} files. Extracting content...`);

    let allTextContent = '';
    
    for (const pdfKey of s3PdfFiles) {
      try {
        const txtKey = pdfKey.replace('.pdf', '.txt');
        const txtBuffer = await this.getFile(txtKey);
        const content = txtBuffer.toString();
        allTextContent += `\n\n=== CONTENT FROM ${path.basename(pdfKey)} ===\n${content}`;
      } catch (error) {
        this.logger.error(`Error getting text content from ${pdfKey}:`, error);
      }
    }

    if (!allTextContent.trim()) {
      return { status: 'error', message: 'No text content found to merge.' };
    }

    const mergedContent = await this.askGeminiToMerge(allTextContent);

    // Prepare Final Files
    const mergeId = Math.random().toString(36).substring(2, 10);
    const finalPdfBuffer = await this.buildPdf(mergedContent, mergeId);
    const finalTxtBuffer = Buffer.from(mergedContent, 'utf-8');
    
    const finalPdfKey = `${rootFolderPrefix}Final_Merged_${safeClassName}.pdf`;
    const finalTxtKey = `${rootFolderPrefix}Final_Merged_${safeClassName}.txt`;

    this.logger.log(`Cleaning up all files in ${rootFolderPrefix}...`);
    await this.deleteFolderContents(rootFolderPrefix);

    this.logger.log(`Uploading final merged files...`);
    await this.uploadFile(finalPdfKey, finalPdfBuffer, 'application/pdf');
    await this.uploadFile(finalTxtKey, finalTxtBuffer, 'text/plain; charset=utf-8');

    return {
      status: 'ok',
      message: 'Merge complete. Cleanup done. Created PDF and TXT.',
      finalPdfKey: finalPdfKey,
      finalTxtKey: finalTxtKey
    };
  }

  // -------------------------------------------------------------------------
  // 3. Split Merged TXT into Topic PDFs (Fixed for Literature Lists)
  // -------------------------------------------------------------------------
  async splitMergedPdf(userId: string, className: string) {
    const safeClassName = this.sanitizeFilename(className).replace(/\.[^/.]+$/, "");
    const rootFolderPrefix = `${userId}/${safeClassName}/`;
    
    const mergedTxtKey = `${rootFolderPrefix}Final_Merged_${safeClassName}.txt`;

    this.logger.log(`Attempting to split topics from: ${mergedTxtKey}`);

    let fullText = '';
    try {
      const buffer = await this.getFile(mergedTxtKey);
      fullText = buffer.toString('utf-8');
    } catch (error) {
      this.logger.error(`Could not find merged text file: ${mergedTxtKey}`);
      throw new Error('Merged text file not found. Please run merge first.');
    }

    // --- LOGIC START ---
    const lines = fullText.split('\n');
    const topics: { number: string; content: string }[] = [];
    
    let currentTopicNumber = 0; // Track the numeric value
    let currentTopicString = ''; // Track the string "1", "2"
    let currentContent: string[] = [];

    // Keywords that indicate a section might contain a list we shouldn't split
    const literatureKeywords = ['bibliografia', 'literatura', 'źródła', 'wykaz', 'references', 'bibliography'];
    let isInsideLiterature = false;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Match "1. Topic" OR "16. Bibliography"
      // Capture groups: [1] = Number, [2] = Rest of text
      const match = trimmed.match(/^(\d+)\.\s+(.*)/);

      if (match) {
        const foundNumber = parseInt(match[1], 10);
        const topicTitle = match[2].toLowerCase();

        // CHECK 1: Sequence Logic
        // If we found "1." but we are currently at topic "15", this is NOT a new topic.
        // It's likely a list item inside the previous topic.
        const isSequenceReset = foundNumber < currentTopicNumber;

        // CHECK 2: Literature Logic
        // If we are currently inside a literature topic, ignore all numbers
        // UNLESS the number continues the main sequence (e.g. Topic 16 -> Topic 17)
        const isNextTopic = foundNumber === currentTopicNumber + 1;

        if (isSequenceReset || (isInsideLiterature && !isNextTopic)) {
             // THIS IS CONTENT, NOT A NEW FILE.
             // Mask the dot so buildPdf doesn't make it a huge header.
             // Change "1. Book Name" -> "1) Book Name"
             const maskedLine = line.replace('.', ')');
             currentContent.push(maskedLine);
             continue; // Skip to next line
        }

        // --- NEW TOPIC DETECTED ---
        
        // Save previous topic if exists
        if (currentTopicString) {
            topics.push({ number: currentTopicString, content: currentContent.join('\n') });
        }

        // Start new topic
        currentTopicNumber = foundNumber;
        currentTopicString = match[1];
        currentContent = [trimmed]; // Start with the header

        // Check if this new topic IS the literature section
        isInsideLiterature = literatureKeywords.some(keyword => topicTitle.includes(keyword));

      } else {
        // Just a regular line of text
        if (currentTopicString) {
            currentContent.push(line);
        }
      }
    }

    // Push the last topic
    if (currentTopicString && currentContent.length > 0) {
        topics.push({ number: currentTopicString, content: currentContent.join('\n') });
    }
    // --- LOGIC END ---

    this.logger.log(`Found ${topics.length} actual topics to generate.`);

    const generatedFiles: string[] = [];

    for (const topic of topics) {
        const pdfBuffer = await this.buildPdf(topic.content, 'temp');
        const fileName = `t${topic.number}.pdf`;
        const finalKey = `${rootFolderPrefix}${fileName}`;

        await this.uploadFile(finalKey, pdfBuffer, 'application/pdf');
        generatedFiles.push(finalKey);
    }

    this.logger.log('Deleting merged TXT file (keeping PDF)...');
    await this.s3.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
            Objects: [
                { Key: mergedTxtKey }
            ]
        }
    }));

    return {
        status: 'ok',
        message: `Split into ${generatedFiles.length} files. Merged TXT deleted.`,
        files: generatedFiles
    };
  }

  // -----------------------------
  // Helpers
  // -----------------------------
  private async deleteFolderContents(prefix: string) {
    try {
      let continuationToken: string | undefined = undefined;
      do {
        const listCommand = new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });

        const listRes: ListObjectsV2CommandOutput = await this.s3.send(listCommand);
        
        if (listRes.Contents && listRes.Contents.length > 0) {
          const objectsToDelete = listRes.Contents.map((obj) => ({ Key: obj.Key }));
          await this.s3.send(new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objectsToDelete }
          }));
        }
        continuationToken = listRes.NextContinuationToken;
      } while (continuationToken);
    } catch (error) {
      this.logger.error(`Failed to cleanup folder ${prefix}: ${error.message}`);
    }
  }

  private sanitizeFilename(filename: string): string {
    const baseName = path.basename(filename, path.extname(filename));
    const ext = path.extname(filename);
    const safeName = baseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
    return safeName + ext.toLowerCase();
  }

  private async getFile(key: string): Promise<Buffer> {
    const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = res.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  private uploadFile(key: string, buffer: Buffer, contentType?: string) {
    if (!contentType) {
      if (key.endsWith('.pdf')) contentType = 'application/pdf';
      else if (key.endsWith('.txt')) contentType = 'text/plain';
      else contentType = 'application/octet-stream';
    }
    return this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType }));
  }

  // -----------------------------
  // Gemini API 
  // -----------------------------
  private async askGemini(txtBuffer: Buffer, pdfBuffer: Buffer): Promise<string> {
    try {
      const textContent = txtBuffer.toString();
      const pdfBase64 = pdfBuffer.toString('base64');

      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: `ANALYZE THIS EDUCATIONAL CONTENT AND ORGANIZE IT INTO NUMBERED TOPICS:

  ORIGINAL CONTENT:
  ${textContent}

  PDF WITH IMAGES:

  YOUR TASK:
  1. Extract all the main topics from the content
  2. For each topic, include ALL relevant text and explanations
  3. Describe any important images/diagrams from the PDF
  4. Number each topic clearly
  5. ALL THE TEXT YOU NEED TO OUTPUT SHOULD BE WRITTEN IN POLISH. IF THE GIVEN TEXT WRITTEN IN OTHER LANGUAGE YOU NEED TO TRANSLATE IT TO POLISH. IF THERE IS A POLISH LANGUAGE DON'T TRANSLATE IT TO THE ENGLISH. 

  REQUIRED OUTPUT FORMAT:

  1. First Topic Name
  [All the text and explanations for this first topic. Include everything important. Describe relevant images from PDF if any.]

  2. Second Topic Name  
  [All the text and explanations for this second topic. Include everything important. Describe relevant images from PDF if any.]

  3. Third Topic Name
  [All the text and explanations for this third topic. Include everything important. Describe relevant images from PDF if any.]

  Continue with as many topics as needed.

  RULES:
  - Use ONLY numbered topics (1., 2., 3., etc.)
  - Each topic should have ALL the relevant content grouped together
  - Include image descriptions where relevant
  - No bullet points, no sections, no design - just plain text under each numbered topic
  - Don't skip any important information, dont add something new, just group everything where it needs
  - Keep the original meaning but organize it logically
  - If there is no images dont write "There are no images or diagrams present in the provided PDF content to describe."
  - There is no need to include ** near the topics`
              },
              {
                inlineData: {
                  mimeType: 'application/pdf',
                  data: pdfBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
        }
      };

      const urlWithKey = `${this.geminiUrl}?key=${this.geminiApiKey}`;
      
      const res = await axios.post(urlWithKey, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000,
      });

      let resultText = '';
      if (res.data.candidates?.[0]?.content?.parts?.[0]?.text) {
        resultText = res.data.candidates[0].content.parts[0].text;
      } else if (res.data.contents?.[0]?.parts?.[0]?.text) {
        resultText = res.data.contents[0].parts[0].text;
      } else if (res.data.text) {
        resultText = res.data.text;
      }
      return resultText;

    } catch (error) {
      throw new Error(`Gemini API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  private async askGeminiToMerge(allContent: string): Promise<string> {
    try {
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: `MERGE AND DEDUPLICATE THIS EDUCATIONAL CONTENT:

${allContent}

YOUR TASK:
1. Merge all the content from different sources into one coherent document
2. Remove duplicate information - if the same topic appears multiple times, keep only one version
3. Keep ALL original information and titles - don't change any content, text should be the same as the taken pdf. Only if there are massive duplicates remove one of the titles, DONT CHANGE ANY TEXT
4. Renumber all topics sequentially starting from 1
5. Maintain the same topic structure and formatting
6. Preserve all important details, examples, and explanations
7. Keep the output in Polish language and only, even if the language is other than the polish translate it to polish

REQUIRED OUTPUT FORMAT:

1. First Topic Name
[All the original text for this topic without changes]

2. Second Topic Name  
[All the original text for this topic without changes]

3. Third Topic Name
[All the original text for this topic without changes]

Continue with as many topics as needed.

RULES:
- Use ONLY numbered topics (1., 2., 3., etc.)
- Remove duplicate topics but keep all unique information
- Don't modify the content of topics, just remove duplicates
- Renumber everything sequentially
- Maintain the same plain text format
- Keep all image descriptions and important details, and all information, text should be the same`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 16000,
        }
      };

      const urlWithKey = `${this.geminiUrl}?key=${this.geminiApiKey}`;
      
      const res = await axios.post(urlWithKey, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 300000,
      });

      let resultText = '';
      if (res.data.candidates?.[0]?.content?.parts?.[0]?.text) {
        resultText = res.data.candidates[0].content.parts[0].text;
      } else if (res.data.contents?.[0]?.parts?.[0]?.text) {
        resultText = res.data.contents[0].parts[0].text;
      } else if (res.data.text) {
        resultText = res.data.text;
      }
      return resultText;

    } catch (error) {
      throw new Error(`Gemini API merge failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // -----------------------------
  // Build PDF (Fixed: Regex Safety)
  // -----------------------------
  private async buildPdf(content: string, id: string): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);

    const regularFontBytes = fs.readFileSync(
      path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf')
    );

    const font = await pdf.embedFont(regularFontBytes);

    let page = pdf.addPage([595, 842]);
    const topicSize = 14;
    const fontSize = 11;
    const lineHeight = 14;
    const margin = 50;
    const maxWidth = page.getWidth() - margin * 2;

    let x = margin;
    let y = page.getHeight() - margin;

    const lines = content.split('\n').filter(line => line.trim().length > 0);

    for (const line of lines) {
      if (y < margin + 40) {
        page = pdf.addPage([595, 842]);
        y = page.getHeight() - margin;
      }

      const cleanLine = line.trim();

      // Ensure we only bold ACTUAL top-level headers, not sub-lists we masked with ')'
      // The splitMergedPdf turns sublists into "1)" so this regex "^\d+\." won't match them.
      const isTopicLine = /^\d+\.\s/.test(cleanLine);

      if (isTopicLine) {
        if (y < page.getHeight() - margin) {
          y -= 8;
        }
        page.drawText(cleanLine, {
          x,
          y,
          size: topicSize,
          font: font,
          color: rgb(0, 0, 0),
        });

        y -= topicSize + 4;
        continue;
      }

      const wrapped = this.wrapText(cleanLine, maxWidth, font, fontSize);

      for (const wLine of wrapped) {
        if (y < margin) {
          page = pdf.addPage([595, 842]);
          y = page.getHeight() - margin;
        }

        page.drawText(wLine, {
          x,
          y,
          size: fontSize,
          font: font,
          color: rgb(0, 0, 0),
        });

        y -= lineHeight;
      }
    }

    return Buffer.from(await pdf.save());
  }

  private wrapText(text: string, maxWidth: number, font: any, size: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, size);

      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
}