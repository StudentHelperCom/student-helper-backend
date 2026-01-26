import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class ProcessingAiService {
  private readonly logger = new Logger(ProcessingAiService.name);
  private geminiApiKey = process.env.GEMINI_API_KEY!;
  private geminiUrl = process.env.GEMINI_URL!;

  private sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
  }
  
  public async askGeminiWithRetry(txt: Buffer, pdf: Buffer, attempts = 5): Promise<string> {
    // 1. Data Preparation: Convert buffers to strings/base64 for AI consumption
    const textContent = txt.toString();
    
    // 2. Prompt Engineering: Construct the instruction payload for topic extraction
    const parts: any[] = [
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
        }
    ];

    // 3. Multimodal Integration: Attach PDF as inline data if available
    if (pdf && pdf.length > 0) {
        const pdfBase64 = pdf.toString('base64');
        parts.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64
          }
        });
    }
    
    // 4. Execution: Initiate the AI request with retry logic
    return this.runGeminiRequest(parts, 'text', attempts);
  }

  public async askGeminiToMerge(allContent: string): Promise<string> {
    // 1. Prompt Engineering: Construct the instruction payload for content merging
    const parts = [
        {
            text: `MERGE AND DEDUPLICATE THIS EDUCATIONAL CONTENT:

${allContent}

YOUR TASK:
1. Merge all the content from different sources into one coherent document
2. **CRITICAL:** Fix the structure. Identify MAIN TOPICS vs. SUB-POINTS.
   - Example of BAD structure: 
     "13. Analysis" (Topic)
     "14. 1. Results" (This is WRONG. "1. Results" should be content INSIDE "Analysis", not a new topic 14).
   - Example of GOOD structure:
     "13. Analysis" -> Text contains "1. Results..." inside it.
3. Remove duplicate information.
4. Keep ALL original information and titles.
5. Output in POLISH language.

HIERARCHY & STRUCTURE RULES:
- **MAIN TOPICS**: Number them sequentially (1., 2., 3...). These are the big headlines (e.g., Introduction, Methodology, Analysis).
- **INTERNAL LISTS**: If a topic contains a list (1., 2. or a., b. or 1.1, 1.2), keep it INSIDE the text of that topic. Do NOT turn list items into new Main Topics.
- **DEDUPLICATION**: If "Introduction" appears twice, merge the text into ONE "1. Introduction" topic.

REQUIRED OUTPUT FORMAT:

1. Main Topic Name
[All text, paragraphs, sub-points (1.1, 1.2 etc.) and lists belong here. Do not break them into new Main Topics.]

2. Next Main Topic Name
[Content...]

...

RULES:
- Use ONLY numbered topics (1., 2., 3.) for the MAIN sections.
- Do NOT use Markdown bolding (**) or headers (##) inside the text content. Just plain text.
- If you see "1.1", "1.2" inside a text, keep it as text, do not make it a "Topic".
- Dont write sentences like "Here is the merged content", just start with "1. Topic Name".`
        }
    ];

    // 2. Execution: Initiate the AI request with retry logic
    return this.runGeminiRequest(parts, 'text');
  }

  private async runGeminiRequest(parts: any[], expectedType: 'text', attempts = 5): Promise<string> {
    for (let i = 0; i < attempts; i++) {
        try {
            // 1. API Call: Send payload to Google Gemini via REST
            const response = await axios.post(
                `${this.geminiUrl}?key=${this.geminiApiKey}`,
                {
                    contents: [{ parts }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 16384, 
                    },
                },
                { 
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 600000 // 10 minutes for processing
                }
            );

            // 2. Result Extraction: Parse the AI response structure
            return this.extractTextFromResponse(response);

        } catch (error: any) {
            // 3. Error Analysis: Determine if the error is transient or fatal
            const status = error.response?.status;
            const message = error.message || '';
            const isRateLimit = status === 429 || message.includes('Quota exceeded');
            
            const isNetworkError = 
                message.includes('ECONNRESET') || 
                message.includes('ETIMEDOUT') ||
                status === 503;

            // 4. Failure Handling: Stop if max attempts reached
            if (i === attempts - 1) {
                 this.logger.error(`Gemini Fatal Error after ${attempts} attempts: ${message}`);
                 throw new Error(`Gemini API failed: ${error.response?.data?.error?.message || message}`);
            }

            // 5. Backoff Strategy: Apply exponential wait for rate limits/network issues
            if (isRateLimit) {
                const waitTime = 20000 + (i * 5000); 
                this.logger.warn(`Gemini Quota Exceeded (Attempt ${i+1}/${attempts}). Cooling down for ${waitTime/1000}s...`);
                await this.sleep(waitTime);
                continue;
            }

            if (isNetworkError) {
                const waitTime = 2000 * (i + 1);
                this.logger.warn(`Gemini Network Error (Attempt ${i+1}/${attempts}): ${message}`);
                await this.sleep(waitTime); 
                continue;
            }
            
            // 6. Immediate Failure: Non-retriable errors (e.g., 400 Bad Request)
            throw error;
        }
    }
    throw new Error('Unreachable code');
  }

  private extractTextFromResponse(res: any): string {
    // 1. Response Parsing: Navigate nested JSON to find the text candidate
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