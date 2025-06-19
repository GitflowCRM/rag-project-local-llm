import { Injectable } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class RagService {
  constructor(
    private readonly eventsService: EventsService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly llmService: LlmService,
  ) {}

  async query(question: string): Promise<{ answer: string }> {
    // 1. Generate embedding for the question
    const questionEmbedding =
      await this.embeddingsService.generateEmbedding(question);

    // 2. Find similar events using vector similarity
    const similarEvents = await this.eventsService.findSimilarEvents(
      questionEmbedding,
      3,
    );

    // 3. Build context from similar events
    const context = similarEvents
      .map((event) => {
        const timestamp =
          event.event_timestamp instanceof Date
            ? event.event_timestamp.toISOString()
            : String(event.event_timestamp);
        return `Event Type: ${event.event_type}
User ID: ${event.user_id}
Timestamp: ${timestamp}
Data: ${JSON.stringify(event.event_data)}`;
      })
      .join('\n\n');

    // 4. Generate answer with context
    const prompt = `You are a question-answering system that ONLY answers questions based on the provided context. 

Instructions:
1. If the answer can be found in the context, provide it clearly and concisely.
2. If the answer cannot be found in the context, respond EXACTLY with: "I cannot answer this question based on the available information in the knowledge base."
3. NEVER make up information or use external knowledge.
4. NEVER try to infer or guess information that isn't explicitly in the context.

Context:
${context}

Question: ${question}

Answer:`;

    const answer = await this.llmService.generateResponse(prompt);
    return { answer };
  }

  async ingest(): Promise<{ ingestedCount: number; events: any[] }> {
    // 1. Get events that need ingestion
    const events = await this.eventsService.findUningestedEvents();

    if (events.length === 0) {
      return { ingestedCount: 0, events: [] };
    }

    // 2. Generate embeddings for events
    const eventsWithEmbeddings = await Promise.all(
      events.map(async (event) => ({
        id: event.id,
        embedding: await this.embeddingsService.generateEmbedding(
          JSON.stringify(event),
        ),
      })),
    );

    // 4. Update ingested_at timestamp
    await Promise.all(
      events.map((event) =>
        this.eventsService.updateIngestedAt(event.id, new Date()),
      ),
    );

    return {
      ingestedCount: eventsWithEmbeddings.length,
      events: eventsWithEmbeddings,
    };
  }
}
