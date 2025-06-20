import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { EventsService } from '../events/events.service';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

@Injectable()
export class EmbeddingsService {
  private embeddings: OpenAIEmbeddings;
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(
    private readonly eventsService: EventsService,
    private readonly configService: ConfigService,
  ) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: this.configService.get<string>('OPENAI_API_KEY'),
      modelName: this.configService.get<string>('EMBEDDING_MODEL'),
    });

    this.chunkSize = this.configService.get<number>('CHUNK_SIZE') || 1000;
    this.chunkOverlap = this.configService.get<number>('CHUNK_OVERLAP') || 200;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.embeddings.embedQuery(text);
    return result;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const results = await this.embeddings.embedDocuments(texts);
    return results;
  }

  async processEventData(eventData: Record<string, any>): Promise<string[]> {
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: this.chunkSize,
      chunkOverlap: this.chunkOverlap,
    });

    const text = JSON.stringify(eventData);
    const chunks = await textSplitter.splitText(text);
    return chunks;
  }
}
