import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ProcessingAi {
  private readonly logger = new Logger(ProcessingAi.name);

  private geminiApiKey = process.env.GEMINI_API_KEY!;
  private geminiUrl = process.env.GEMINI_URL!;

  // Internal helper for retries
  private sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
  }

  // -------------------------------------------------------------------------
  // Public AI Methods
  // -------------------------------------------------------------------------

  /**
   * Main entry point for processing individual files with Retry Logic
   */
  public async askGeminiWithRetry(txt: Buffer, pdf: Buffer, attempts = 5): Promise<string> {
    for (let i = 0; i < attempts; i++) {
        try {
            return await this.askGemini(txt, pdf);
        } catch (error: any) {
            const status = error.response?.status;
            const message = error.message || '';

            // === CRITICAL FIX FOR MULTITASKING & CUTOFFS ===
            const isRateLimit = status === 429 || message.includes('Quota exceeded');
            
            const isNetworkError = 
                message.includes('ECONNRESET') || 
                message.includes('ETIMEDOUT') ||
                status === 503;

            if (isRateLimit) {
                // Wait longer for quota issues (20s, 25s, 30s...)
                const waitTime = 20000 + (i * 5000); 
                this.logger.warn(`Gemini Quota Exceeded (Attempt ${i+1}/${attempts}). Cooling down for ${waitTime/1000}s...`);
                await this.sleep(waitTime);
                continue;
            }

            if (isNetworkError) {
                // Exponential backoff: 2s, 4s, 6s...
                const waitTime = 2000 * (i + 1);
                this.logger.warn(`Gemini Network Error (Attempt ${i+1}/${attempts}): ${message}`);
                await this.sleep(waitTime); 
                continue;
            }
            // If it's a logic error (e.g. 400 Bad Request), fail immediately
            throw error; 
        }
    }
    throw new Error('Gemini API failed after retries due to network instability.');
  }

  /**
   * Main entry point for merging content
   */
  public async askGeminiToMerge(allContent: string): Promise<string> {
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
- Keep all image descriptions and important details, and all information, text should be the same
- Dont write sentences like Oto połączona i zdeduplikowana treść:, just the information i need`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 16384, // Increased to prevent cutoffs
        }
      };

      const urlWithKey = `${this.geminiUrl}?key=${this.geminiApiKey}`;
      
      const res = await axios.post(urlWithKey, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 600000, // Increased to 10 minutes to prevent cutoffs
      });

      return this.extractTextFromResponse(res);

    } catch (error: any) {
      throw new Error(`Gemini API merge failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Private Implementation Details
  // -------------------------------------------------------------------------

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
  - There is no need to include ** near the topics and other words. Dont use bold text or something instead of standart text.Please answer in plain paragraphs, do not use bullet points or numbered lists
  - Dont write sentences like Oto połączona i zdeduplikowana treść:, just the information i need`
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
          maxOutputTokens: 16384, // Increased from 8192 to 16384 to fix truncated text
        }
      };

      const urlWithKey = `${this.geminiUrl}?key=${this.geminiApiKey}`;
      
      const res = await axios.post(urlWithKey, requestBody, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 600000, // Increased from 3m to 10m to prevent network cutoffs
      });

      return this.extractTextFromResponse(res);

    } catch (error: any) {
      throw new Error(`Gemini API failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  private extractTextFromResponse(res: any): string {
    if (res.data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return res.data.candidates[0].content.parts[0].text;
    } else if (res.data.contents?.[0]?.parts?.[0]?.text) {
        return res.data.contents[0].parts[0].text;
    } else if (res.data.text) {
        return res.data.text;
    }
    return '';
  }
}