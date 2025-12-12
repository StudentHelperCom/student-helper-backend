import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class QuizAi {
  private readonly logger = new Logger(QuizAi.name);
  private geminiUrl = process.env.GEMINI_URL!;
  private geminiApiKey = process.env.GEMINI_API_KEY!;

  async generateQuizQuestions(content: string): Promise<any> {
    this.logger.log('Wysyłanie treści do Gemini w celu generowania quizu (nowa struktura)...');

    const prompt = `
    Jesteś ekspertem edukacyjnym. Na podstawie poniższego tekstu stwórz quiz wielokrotnego wyboru.
    
    TREŚĆ MATERIAŁU:
    ${content.substring(0, 30000)}

    ZADANIE:
    1. Stwórz 5-10 pytań sprawdzających zrozumienie tekstu.
    2. Każde pytanie musi mieć unikalne numeryczne ID (1, 2, 3...).
    3. Każde pytanie musi mieć tablicę odpowiedzi 'answers'.
    4. Każda odpowiedź musi mieć pole 'text' i boolean 'is_correct'.
    5. Tylko jedna odpowiedź w pytaniu może być true.

    WYMAGANY FORMAT JSON (Strict JSON, bez markdown):
    {
      "questions": [
        {
          "id": 1,
          "question": "Tutaj treść pytania?",
          "answers": [
            { "text": "Błędna odpowiedź", "is_correct": false },
            { "text": "Poprawna odpowiedź", "is_correct": true },
            { "text": "Błędna odpowiedź", "is_correct": false },
            { "text": "Błędna odpowiedź", "is_correct": false }
          ]
        }
      ]
    }
    `;

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

    } catch (error) {
      this.logger.error(`Błąd Gemini: ${error.message}`);
      throw new Error('Nie udało się wygenerować pytań.');
    }
  }

  private cleanAndParseJson(text: string): any {
    try {
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      
      if (!parsed.questions && Array.isArray(parsed)) {
          return { questions: parsed }; 
      }
      return parsed;
    } catch (e) {
      this.logger.error('Błąd parsowania JSON od AI. Surowy tekst:', text);
      return { questions: [] };
    }
  }
}