import { Injectable, Logger } from '@nestjs/common';
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
    1. Create 5-10 questions to test understanding of the text.
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

    return this.callGeminiModel(prompt);
  }

  async generateFlashcards(content: string): Promise<any> {
    this.logger.log('Sending content to Gemini for Flashcards generation...');

    const prompt = `
    You are an educational expert. Create study flashcards based on the text below.
    
    CONTENT:
    ${content.substring(0, 30000)}

    TASK:
    1. Create 10-15 flashcards extracting key terms, definitions, or concepts.
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

    return this.callGeminiModel(prompt);
  }

  private async callGeminiModel(prompt: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.geminiUrl}?key=${this.geminiApiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
          },
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return this.cleanAndParseJson(rawText);

    } catch (error: any) {
      this.logger.error(`Gemini Error: ${error.message}`);
      throw new Error('Failed to generate content from AI.');
    }
  }

  private cleanAndParseJson(text: string): any {
    try {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (!parsed.questions && !parsed.flashcards && Array.isArray(parsed)) {
          if (parsed.length > 0 && parsed[0].answers) return { questions: parsed };
          if (parsed.length > 0 && parsed[0].answer && !parsed[0].answers) return { flashcards: parsed };
      }
      return parsed;
    } catch (e) {
      this.logger.error('JSON Parsing Error. Raw text:', text);
      return {}; 
    }
  }
}