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

    const finalPdf = await this.buildPdf(aiOutput);

    await this.uploadFile(`final/${id}.pdf`, finalPdf);

    return { status: 'ok', outputKey: `final/${id}.pdf` };
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

  private uploadFile(key: string, buffer: Buffer) {
    return this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
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
  private async buildPdf(content: string): Promise<Buffer> {
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
        page.drawText(cleanLine, {
          x,
          y,
          size: topicSize,
          font: font,
          color: rgb(0, 0, 0),
        });

        y -= topicSize + 8;
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

      // Small spacing between paragraphs
      y -= 4;
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
   * Merge specified PDFs from /final folder into final-merged/merged.pdf
   * Deduplicate by first line (topic name)
   */
  
  async mergeFinalPdfsS3(filesToMerge?: string[]) {
    const mergedKey = 'final-merged/merged.pdf';

    // 1. Get all PDFs in S3 final/ folder
    let s3Files: string[] = [];

    if (filesToMerge?.length) {
      s3Files = filesToMerge.map(f => `final/${f.endsWith('.pdf') ? f : `${f}.pdf`}`);
    } else {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: 'final/',
      });

      const res = await this.s3.send(listCommand);
      s3Files = res.Contents?.filter(obj => obj.Key?.endsWith('.pdf')).map(obj => obj.Key!) || [];
    }

    if (!s3Files.length) {
      return { status: 'empty', message: 'No PDFs found in S3 final/ folder' };
    }

    this.logger.log(`Merging ${s3Files.length} PDF files from S3: ${s3Files.join(', ')}`);

    // 2. Merge all PDFs (no deduplication)
    const mergedPdf = await PDFDocument.create();

    for (const key of s3Files) {
      try {
        const fileBytes = await this.getFile(key);
        const srcPdf = await PDFDocument.load(fileBytes);
        const pages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        pages.forEach(p => mergedPdf.addPage(p));
      } catch (error) {
        this.logger.error(`Error adding pages from ${key}:`, error);
      }
    }

    // 3. Save merged PDF back to S3
    const mergedBytes = await mergedPdf.save();
    await this.uploadFile(mergedKey, Buffer.from(mergedBytes));

    return {
      status: 'ok',
      totalSourceFiles: s3Files.length,
      outputKey: mergedKey,
      mergedFiles: s3Files,
    };
  }
}