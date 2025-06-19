import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { LLM_MODELS } from '../queue/const';

interface LLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Interface for PostHog event payload structure
interface PosthogEventPayload {
  summary: string;
  person_id: string;
  event_count: number;
  event_types: string[];
  vendor_ids: string[];
  shop_domains: string[];
  time_span: string;
  first_event: string;
  last_event: string;
  flattened_data: Record<string, string[]>;
  events: Array<{
    event: string;
    properties: Record<string, any>;
    timestamp: Date;
    uuid: string;
  }>;
}

interface QueryRequest {
  question: string;
  top_k?: number;
  model_override?: string;
  filters?: {
    person_id?: string;
    vendor_id?: string;
    shop_domain?: string;
    event_types?: string[];
    time_range?: {
      start?: string;
      end?: string;
    };
  };
}

interface QueryResponse {
  question: string;
  answer: string;
  sources: Array<{
    person_id: string;
    score: number;
    summary: string;
  }>;
  metadata: {
    total_sources: number;
    search_time_ms: number;
    model_used?: string;
  };
}

@Injectable()
export class LlmService {
  private readonly apiUrl: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly qdrantService: QdrantService,
    private readonly embeddingsService: EmbeddingsService,
  ) {
    this.apiUrl = this.configService.get<string>('LLM_API_URL') || '';
    this.model = this.configService.get<string>('LLM_MODEL') || '';
    this.temperature = this.configService.get<number>('LLM_TEMPERATURE') || 0.2;
    this.maxTokens = this.configService.get<number>('LLM_MAX_TOKENS') || 4096;
  }

  async generateResponse(
    prompt: string,
    modelOverride?: string,
  ): Promise<string> {
    try {
      const modelToUse = modelOverride || this.model;

      const response = await axios.post<LLMResponse>(
        `${this.apiUrl}/chat/completions`,
        {
          model: modelToUse,
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

  async queryPosthogEvents(request: QueryRequest): Promise<QueryResponse> {
    const startTime = Date.now();
    // 1. Generate embedding for the query
    const queryEmbedding = await this.embeddingsService.generateEmbedding(
      request.question,
    );
    // 2. Search in Qdrant for relevant PostHog events
    const searchResults = await this.qdrantService.search(
      'posthog_events',
      queryEmbedding,
      request.top_k || 3, // Limit to 3 by default
    );
    if (!searchResults.result || searchResults.result.length === 0) {
      return {
        question: request.question,
        answer:
          "I couldn't find any relevant user activity data to answer your question.",
        sources: [],
        metadata: {
          total_sources: 0,
          search_time_ms: Date.now() - startTime,
        },
      };
    }
    // 3. Prepare context from search results
    const context = this.prepareContext(searchResults.result);
    // 4. Generate LLM response with model selection based on query complexity
    const prompt = this.buildPrompt(request.question, context);
    const answer = await this.generateResponse(prompt, LLM_MODELS.REASONING);
    // 5. Format sources for response (minimal fields only)
    const sources = searchResults.result
      .slice(0, request.top_k || 3)
      .map((result) => {
        const payload = result.payload as unknown as PosthogEventPayload;
        let summary = payload.summary || 'No summary available';
        if (summary.length > 150) {
          summary = summary.substring(0, 147) + '...';
        }
        return {
          person_id: payload.person_id,
          score: result.score,
          summary,
        };
      });
    return {
      question: request.question,
      answer,
      sources,
      metadata: {
        total_sources: sources.length,
        search_time_ms: Date.now() - startTime,
        model_used: LLM_MODELS.REASONING,
      },
    };
  }

  private selectModelForQuery(
    question: string,
    context: string,
  ): string | undefined {
    // Use faster models for simple queries, more powerful models for complex analysis
    const questionLower = question.toLowerCase();
    const contextLength = context.length;

    // Simple queries that can use faster models
    const simpleQueryKeywords = [
      'count',
      'how many',
      'total',
      'number of',
      'list',
      'show',
      'what is',
      'basic',
      'simple',
      'summary',
      'overview',
    ];

    // Complex queries that need more powerful models
    const complexQueryKeywords = [
      'analyze',
      'compare',
      'trend',
      'pattern',
      'insight',
      'why',
      'how',
      'behavior',
      'correlation',
      'prediction',
      'recommendation',
      'strategy',
    ];

    const isSimpleQuery = simpleQueryKeywords.some((keyword) =>
      questionLower.includes(keyword),
    );

    const isComplexQuery = complexQueryKeywords.some((keyword) =>
      questionLower.includes(keyword),
    );

    const hasLargeContext = contextLength > 10000; // Large context needs more capable model

    // Model selection logic
    if (isSimpleQuery && !hasLargeContext) {
      // Use fast model for simple queries
      return 'microsoft/phi-4-reasoning-plus';
    } else if (isComplexQuery || hasLargeContext) {
      // Use more powerful model for complex analysis
      return 'gemma-3-27b-it';
    }

    // Default: use configured model
    return undefined;
  }

  private prepareContext(
    searchResults: Array<{ payload: unknown; score: number }>,
  ): string {
    const maxEvents = 5; // Only show 5 most recent events per user
    const pickKeys = [
      'person_id',
      'event_count',
      'event_types',
      'vendor_ids',
      'shop_domains',
      'device_type',
      'device_name',
      'os',
      'app_name',
      'app_version',
      'geoip_city_name',
      'geoip_country_name',
      'geoip_latitude',
      'geoip_longitude',
      'cartTotal',
      'itemsCount',
      'cartCurrency',
      'user_name',
      'user_email',
      'emailVerified',
    ];

    return searchResults
      .map((result, index) => {
        const payload = result.payload as PosthogEventPayload;
        const meta: Record<string, any> = {};
        // Flattened metadata (if available)
        if (payload.flattened_data) {
          for (const key of pickKeys) {
            if (
              payload.flattened_data[key] &&
              payload.flattened_data[key].length > 0
            ) {
              meta[key] = payload.flattened_data[key][0];
            }
          }
        }
        // Top-level fields
        meta['person_id'] = payload.person_id;
        meta['event_count'] = payload.event_count;
        meta['event_types'] = (payload.event_types || []).join(', ');
        meta['vendor_ids'] = (payload.vendor_ids || []).join(', ');
        meta['shop_domains'] = (payload.shop_domains || []).join(', ');
        meta['time_span'] = payload.time_span;

        // Add summary section
        let summarySection = '';
        if (payload.summary) {
          summarySection = `\nSummary:\n${payload.summary}`;
        }

        // Timeline: last N events
        let timeline = '';
        if (payload.events && payload.events.length > 0) {
          const events = payload.events.slice(-maxEvents);
          timeline = events
            .map(
              (e) =>
                `  - [${e.timestamp ? new Date(e.timestamp).toISOString() : ''}] ${e.event}` +
                (e.properties && Object.keys(e.properties).length > 0
                  ? ` (${Object.entries(e.properties)
                      .slice(0, 2)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(', ')})`
                  : ''),
            )
            .join('\n');
        }

        // Format metadata for LLM
        const metaStr = Object.entries(meta)
          .filter(
            (entry) =>
              entry[1] !== undefined && entry[1] !== null && entry[1] !== '',
          )
          .map(([k, v]) => `- ${k}: ${v}`)
          .join('\n');

        return `User Profile ${index + 1} (Score: ${(result.score * 100).toFixed(1)}%)\n${metaStr}${summarySection}\nRecent Events:\n${timeline}`;
      })
      .join('\n---\n');
  }

  private buildPrompt(question: string, context: string): string {
    return `You are an AI assistant that analyzes user behavior data from PostHog events. You have access to detailed user profiles and activity summaries.

Question: ${question}

Context from user activity data:
${context}

Instructions:
1. Analyze the provided user activity data to answer the question
2. Be specific and reference the data when possible
3. If the data doesn't contain enough information to answer the question, say so
4. Focus on user behavior patterns, device usage, location data, and app interactions
5. Provide insights about user engagement, shopping behavior, and technical context

Please provide a comprehensive answer based on the user activity data:`;
  }
}
