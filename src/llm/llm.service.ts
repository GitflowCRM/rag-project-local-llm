import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

@Injectable()
export class LlmService {
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.get<string>('LLM_API_URL') || '';
    this.model = this.configService.get<string>('LLM_MODEL') || '';
    this.temperature = this.configService.get<number>('LLM_TEMPERATURE') || 0.2;
    this.maxTokens = this.configService.get<number>('LLM_MAX_TOKENS') || 4096;
  }

  async generateResponse(prompt: string): Promise<string> {
    try {
      const response = await axios.post<LLMResponse>(
        `${this.apiUrl}/chat/completions`,
        {
          model: this.model,
          temperature: this.temperature,
          stream: false,
          max_tokens: this.maxTokens,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('Error calling LLM:', error);
      throw new Error('Failed to generate response from LLM');
    }
  }
}
