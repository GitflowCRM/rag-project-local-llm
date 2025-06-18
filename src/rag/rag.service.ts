import { Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { LlmService } from '../llm/llm.service';
import { Event } from '../events/entities/event.entity';

@Injectable()
export class RagService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly llmService: LlmService,
  ) {}

  async processQuery(
    question: string,
    filters?: { eventType?: string },
  ): Promise<string> {
    // Generate embedding for the question
    const questionEmbedding =
      await this.embeddingsService.generateEmbedding(question);

    // Get relevant events based on filters
    let events: Event[];
    if (filters?.eventType) {
      events = await this.eventsService.findByEventType(filters.eventType);
    } else {
      events = await this.eventsService.findAll();
    }

    // Find most similar events using cosine similarity
    const similarEvents = events
      .filter((event) => event.embedding)
      .map((event) => ({
        event,
        similarity: this.cosineSimilarity(questionEmbedding, event.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    // Construct context from similar events
    const context = similarEvents
      .map(({ event }) => {
        return `Event Type: ${event.event_type}
User ID: ${event.user_id}
Timestamp: ${event.event_timestamp.toISOString()}
Data: ${JSON.stringify(event.event_data)}`;
      })
      .join('\n\n');

    // Construct prompt with context and question
    const prompt = `Based on the following event data, please answer the question:

Context:
${context}

Question: ${question}

Please provide a clear and concise answer based only on the provided context.`;

    // Generate response using LLM
    return this.llmService.generateResponse(prompt);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    return dotProduct / (magnitudeA * magnitudeB);
  }
}
