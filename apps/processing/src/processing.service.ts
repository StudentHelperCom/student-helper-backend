import { Injectable, Logger } from '@nestjs/common';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import axios from 'axios';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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

  async process(id: string) {
    const txtKey = `processed/${id}.txt`;
    const pdfKey = `uploads/${id}.pdf`;

    this.logger.log(`Processing ${id}...`);

    const txtBuffer = await this.getFile(txtKey);
    const pdfBuffer = await this.getFile(pdfKey);

    const aiOutput = await this.askGemini(txtBuffer, pdfBuffer);

    // Generate unique ID for final files
    const finalId = Math.random().toString(36).substring(2, 10);
    
    // Create both PDF and TXT files
    const finalPdf = await this.buildPdf(aiOutput, finalId);
    const finalTxt = Buffer.from(aiOutput, 'utf-8');

    // Upload both files to S3 with correct content types
    await this.uploadFile(`final/${finalId}.pdf`, finalPdf, 'application/pdf');
    await this.uploadFile(`final/${finalId}.txt`, finalTxt, 'text/plain; charset=utf-8');

    return { 
      status: 'ok', 
      finalId: finalId,
      pdfKey: `final/${finalId}.pdf`,
      txtKey: `final/${finalId}.txt`
    };
  }

  // -----------------------------
  // S3 helpers
  // -----------------------------
  private async getFile(key: string): Promise<Buffer> {
    try {
      this.logger.log(`Attempting to fetch file from S3: ${key}`);
      
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      const stream = res.Body as Readable;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) chunks.push(chunk as Buffer);

      this.logger.log(`Successfully fetched file: ${key}`);
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(`Failed to fetch file ${key} from S3:`, error);
      throw error;
    }
  }

  private uploadFile(key: string, buffer: Buffer, contentType?: string) {
    // Determine content type based on file extension if not provided
    if (!contentType) {
      if (key.endsWith('.pdf')) {
        contentType = 'application/pdf';
      } else if (key.endsWith('.txt')) {
        contentType = 'text/plain';
      } else {
        contentType = 'application/octet-stream';
      }
    }

    return this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
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
          maxOutputTokens: 4000,
        }
      };

      const urlWithKey = `${this.geminiUrl}?key=${this.geminiApiKey}`;

      console.log('Creating structured topics from content...');
      
      const res = await axios.post(urlWithKey, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 120000,
      });

      // Safe response extraction
      let resultText = '';
      if (res.data.candidates?.[0]?.content?.parts?.[0]?.text) {
        resultText = res.data.candidates[0].content.parts[0].text;
      } else if (res.data.contents?.[0]?.parts?.[0]?.text) {
        resultText = res.data.contents[0].parts[0].text;
      } else if (res.data.text) {
        resultText = res.data.text;
      } else {
        console.warn('Unexpected response structure:', res.data);
        resultText = JSON.stringify(res.data);
      }

      console.log('Structured Topics Created');
      return resultText;

    } catch (error) {
      console.error('Gemini API Error:', error.response?.data || error.message);
      throw new Error(`Gemini API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // -----------------------------
  // Build resulting PDF
  // -----------------------------
// -----------------------------
// Build resulting PDF and TXT
// -----------------------------
private async buildPdf(content: string, id: string): Promise<Buffer> {
  // Create PDF and register fontkit so we can load TTF fonts
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);

  // Load Unicode-supported TTF fonts
  const regularFontBytes = fs.readFileSync(
    path.join(__dirname, '..', 'assets', 'fonts', 'DejaVuSans.ttf')
  );

  const font = await pdf.embedFont(regularFontBytes);

  // Create first page
  let page = pdf.addPage([595, 842]); // A4 portrait
  const topicSize = 14;
  const fontSize = 11;
  const lineHeight = 14;
  const margin = 50;
  const maxWidth = page.getWidth() - margin * 2;

  let x = margin;
  let y = page.getHeight() - margin;

  // Split into lines
  const lines = content.split('\n').filter(line => line.trim().length > 0);

  for (const line of lines) {
    // Create new page if needed
    if (y < margin + 40) {
      page = pdf.addPage([595, 842]);
      y = page.getHeight() - margin;
    }

    const cleanLine = line.trim();

    // Detect numbered-topic headings (e.g., "1. Something", "12. Topic name")
    const isTopicLine = /^\d+\.\s/.test(cleanLine);

    if (isTopicLine) {
      // Draw topic title
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

    // Wrap long lines
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

/**
 * Merge specified PDFs from /final folder using their corresponding TXT files
 */
async mergeFinalPdfsS3(filesToMerge?: string[]) {
  // Generate random ID for the merged file
  const mergeId = Math.random().toString(36).substring(2, 10);
  const mergedPdfKey = `final-merged/finalmerge-${mergeId}.pdf`;
  const mergedTxtKey = `final-merged/finalmerge-${mergeId}.txt`;

  this.logger.log('Listing all PDF files in S3 final/ folder...');

  const listCommand = new ListObjectsV2Command({
    Bucket: this.bucket,
    Prefix: 'final/',
  });

  const res = await this.s3.send(listCommand);
  const s3PdfFiles: string[] = res.Contents?.filter(obj => obj.Key?.endsWith('.pdf')).map(obj => obj.Key!) || [];

  if (!s3PdfFiles.length) {
    return { status: 'empty', message: 'No PDFs found in S3 final/ folder to merge.' };
  }

  this.logger.log(`Processing ${s3PdfFiles.length} PDF files for AI merging: ${s3PdfFiles.join(', ')}`);

  // 1. Extract text content from all TXT files
  let allTextContent = '';
  
  for (const pdfKey of s3PdfFiles) {
    try {
      // Get the corresponding TXT file
      const txtKey = pdfKey.replace('.pdf', '.txt');
      const txtBuffer = await this.getFile(txtKey);
      const content = txtBuffer.toString();
      allTextContent += `\n\n=== CONTENT FROM ${pdfKey} ===\n${content}`;
    } catch (error) {
      this.logger.error(`Error getting text content from ${pdfKey}:`, error);
    }
  }

  if (!allTextContent.trim()) {
    return { status: 'error', message: 'No text content found to merge.' };
  }

  // 2. Send to Gemini API for intelligent merging
  const mergedContent = await this.askGeminiToMerge(allTextContent);

  // 3. Create final merged PDF and TXT
  const finalPdf = await this.buildPdf(mergedContent, mergeId);
  const finalTxt = Buffer.from(mergedContent, 'utf-8');

  // 4. Save both merged files back to S3 with correct content types
  await this.uploadFile(mergedPdfKey, finalPdf, 'application/pdf');
  await this.uploadFile(mergedTxtKey, finalTxt, 'text/plain; charset=utf-8');

  return {
    status: 'ok',
    mergeId: mergeId,
    totalSourceFiles: s3PdfFiles.length,
    pdfKey: mergedPdfKey,
    txtKey: mergedTxtKey,
    mergedFiles: s3PdfFiles,
  };
}

/**
 * Ask Gemini to merge content intelligently
 */
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
        maxOutputTokens: 8000,
      }
    };

    const urlWithKey = `${this.geminiUrl}?key=${this.geminiApiKey}`;

    this.logger.log('Sending content to Gemini for intelligent merging...');
    
    const res = await axios.post(urlWithKey, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    // Safe response extraction
    let resultText = '';
    if (res.data.candidates?.[0]?.content?.parts?.[0]?.text) {
      resultText = res.data.candidates[0].content.parts[0].text;
    } else if (res.data.contents?.[0]?.parts?.[0]?.text) {
      resultText = res.data.contents[0].parts[0].text;
    } else if (res.data.text) {
      resultText = res.data.text;
    } else {
      console.warn('Unexpected response structure:', res.data);
      resultText = JSON.stringify(res.data);
    }

    this.logger.log('Content successfully merged by AI');
    return resultText;

  } catch (error) {
    console.error('Gemini API Error during merge:', error.response?.data || error.message);
    throw new Error(`Gemini API merge failed: ${error.response?.data?.error?.message || error.message}`);
  }
}
}