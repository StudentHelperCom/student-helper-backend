import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class QuizAiService {
  private readonly logger = new Logger(QuizAiService.name);
  private geminiUrl = process.env.GEMINI_URL!;
  private geminiApiKey = process.env.GEMINI_API_KEY!;

  async generateQuizQuestions(content: string): Promise<any> {
    this.logger.log('Sending content to Gemini for Quiz generation...');

    const prompt = `
    You are an educational expert. Create a multiple-choice quiz based on the text below.
    
    CONTENT:
    ${content.substring(0, 30000)}

    TASK:
    1. Analyze the volume of the provided text: 
      if the content is short, generate 3-5 questions per topic; 
      if the content is extensive, generate 5-8 questions per topic to ensure full coverage.
    2. Each question must have a unique numeric ID.
    3. Each question must have an 'answers' array.
    4. Each answer must have 'text' and 'is_correct' boolean.
    5. Only one answer per question can be true.
    6. All the content must be in Polish.

    REQUIRED JSON FORMAT (Strict JSON, no markdown):
    {
      "questions": [
        {
          "id": 1,
          "question": "Question text here?",
          "answers": [
            { "text": "Wrong answer", "is_correct": false },
            { "text": "Correct answer", "is_correct": true },
            { "text": "Wrong answer", "is_correct": false },
            { "text": "Wrong answer", "is_correct": false }
          ]
        }
      ]
    }
    `;

    return this.runGeminiRequest(prompt);
  }

  async generateFlashcards(content: string): Promise<any> {
    this.logger.log('Sending content to Gemini for Flashcards generation...');

    const prompt = `
    You are an educational expert. Create study flashcards based on the text below.
    
    CONTENT:
    ${content.substring(0, 30000)}

    TASK:
    1. Analyze the volume of the provided text: 
      if the content is short, generate 5-8 questions per topic; 
      if the content is extensive, generate 8-12 questions per topic to ensure full coverage.
    2. 'question' is the front of the card (term/concept).
    3. 'answer' is the back of the card (definition/explanation).
    4. Each card must have a unique numeric ID.
    5. All the content must be in Polish.

    REQUIRED JSON FORMAT (Strict JSON, no markdown):
    {
      "flashcards": [
        {
          "id": 1,
          "question": "Key Term or Question",
          "answer": "Definition or Answer"
        },
        {
          "id": 2,
          "question": "Another Term",
          "answer": "Another Definition"
        }
      ]
    }
    `;

    return this.runGeminiRequest(prompt);
  }

  async generateOpenQuestions(content: string, fileCount: number): Promise<any> {
    this.logger.log(`Generating open questions for ${fileCount} files...`);
    
    const prompt = `
    You are an educational expert. Create an exam with open-ended questions based on the text provided.
    
    CONTENT:
    ${content.substring(0, 30000)}

    TASK:
    1. Analyze the volume of the provided text: 
      if the content is short, generate 3-5 questions per topic; 
      if the content is extensive, generate 5-8 questions per topic to ensure full coverage.
    2. The questions should test deep understanding, not just keywords.
    3. Each question must have a unique numeric ID.
    4. All content must be in Polish.

    REQUIRED JSON FORMAT (Strict JSON, no markdown):
    {
      "questions": [
        {
          "id": 1,
          "question": "Treść pytania otwartego?"
        },
        {
          "id": 2,
          "question": "Kolejne pytanie?"
        }
      ]
    }
    `;

    return this.runGeminiRequest(prompt);
  }

  async evaluateOpenAnswers(content: string, userAnswers: any[]): Promise<any> {
    this.logger.log('Evaluating open answers...');

    const answersJson = JSON.stringify(userAnswers);

    const prompt = `
    You are a strict professor grading an exam. Compare the student's answers to the source text.

    SOURCE TEXT:
    ${content.substring(0, 30000)}

    STUDENT ANSWERS:
    ${answersJson}

    TASK:
    1. For each answer, check if it is correct based strictly on the source text.
    2. Provide a "correct_answer" which is the ideal answer found in the text.
    3. Identify specific problems if the answer is vague, incorrect, or incomplete.
    4. "score" should be integer. There is 10 values: from 1 to 10. You need to choose the grade for the users answer depending on 
    the context: if answer completely not correct and there are no good points, throw 1. If all is good, throw 10. If there are 
    questionable answers, analize them and throw the grade.
    5. All content must be in Polish.

    REQUIRED JSON FORMAT (Strict JSON, no markdown):
    {
      "results": [
        {
          "id": "The original ID of question",
          "question": "The original question text",
          "user_answer": "The student's answer",
          "correct_answer": "The ideal answer from text",
          "score": 2,
          "problems": [
            "The answer is completely wrong because...",
            "It misses the key concept of X"
          ]
        }
      ]
    }
    `;

    return this.runGeminiRequest(prompt);
  }

  async generateStudySummary(content: string, fileCount: number): Promise<any> {
    this.logger.log(`Generating block-based summary for ${fileCount} topics...`);

    const prompt = `
    You are an expert educational content formatter.
    Summarize the provided text into a structured list of content blocks.

    RAW CONTENT:
    ${content.substring(0, 40000)}

    TASK:
    1. Organize the text logically into sections using headings.
    2. Use "list" blocks for enumerations.
    3. All content must be in Polish.

    REQUIRED JSON FORMAT (Strict JSON Array of Objects):
    [
      { "type": "heading", "value": "Title" },
      { "type": "text", "value": "Paragraph text..." },
      { "type": "list", "items": ["Item 1", "Item 2"] }
    ]
    `;

    return this.runGeminiRequest(prompt);
  }

  private async runGeminiRequest(prompt: string, attempts = 3): Promise<any> {
    for (let i = 0; i < attempts; i++) {
      try {
        const response = await axios.post(
          `${this.geminiUrl}?key=${this.geminiApiKey}`,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 8192,
              responseMimeType: "application/json" 
            },
          },
          { headers: { 'Content-Type': 'application/json' }, timeout: 60000 }
        );

        const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!rawText) throw new Error('Empty AI response');

        return this.cleanAndParseJson(rawText);

      } catch (error: any) {
          const status = error.response?.status;
          const msg = error.message || '';

          const isRateLimit = status === 429 || msg.includes('Quota') || msg.includes('Resource has been exhausted');
          const isNetwork = msg.includes('ECONN') || msg.includes('ETIMEDOUT') || status === 503;
          const isParseError = msg.includes('JSON') || msg.includes('SyntaxError') || msg.includes('Unexpected token');

          if (i === attempts - 1) {
              this.logger.error(`Gemini Fatal Error after ${attempts} attempts. Last error: ${msg}`);
              throw new InternalServerErrorException(`AI Processing failed: ${error.response?.data?.error?.message || msg}`);
          }

          if (isRateLimit || isNetwork || isParseError) {
              let waitTime = 0;

              if (isRateLimit) {
                  waitTime = 10000 + (i * 5000);
                  this.logger.warn(`Gemini Quota Exceeded (Attempt ${i + 1}/${attempts}). Cooling down for ${waitTime / 1000}s...`);
              } else {
                  waitTime = 2000 * (i + 1);
                  this.logger.warn(`Retryable Error (${isParseError ? 'JSON/Format' : 'Network'}) (Attempt ${i + 1}/${attempts}): ${msg}. Waiting ${waitTime / 1000}s...`);
              }

              await new Promise(r => setTimeout(r, waitTime));
              continue;
          }

          throw error;
      }    
    }
  }

  private cleanAndParseJson(text: string): any {
    try {
      // 1. Remove markdown code blocks if present
      let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // 2. Intelligent substring extraction (Find outer { } or [ ])
      const startObj = cleaned.indexOf('{');
      const startArr = cleaned.indexOf('[');
      
      let start = -1;
      let end = -1;

      if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
          start = startObj;
          end = cleaned.lastIndexOf('}');
      } else if (startArr !== -1) {
          start = startArr;
          end = cleaned.lastIndexOf(']');
      }

      if (start !== -1 && end !== -1) {
        cleaned = cleaned.substring(start, end + 1);
      }

      const parsed = JSON.parse(cleaned);

      // 3. Normalize structure (Your original mapping logic)
      if (parsed.summary) return { summary: parsed.summary };
      if (Array.isArray(parsed)) {
          if (parsed.length > 0 && parsed[0].type) return { summary: parsed }; 
          if (parsed.length > 0 && parsed[0].answers) return { questions: parsed };
          if (parsed.length > 0 && parsed[0].answer && !parsed[0].answers) return { flashcards: parsed };
          if (parsed.length > 0 && (parsed[0].user_answer || parsed[0].id)) return { results: parsed };
      }
      if (parsed.questions) return { questions: parsed.questions };
      if (parsed.flashcards) return { flashcards: parsed.flashcards };
      if (parsed.results) return { results: parsed.results };

      return parsed;
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      throw new Error(`JSON Parsing failed: ${errorMessage}. Raw: ${text.substring(0, 100)}...`);
    }
  }
}