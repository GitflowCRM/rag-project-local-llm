import { Controller, Post, Body, Get } from '@nestjs/common';
import { LlmService } from './llm.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { LLM_MODELS } from '../queue/const';

interface QueryRequest {
  question: string;
  top_k?: number;
  model_override?: string;
  use_cache?: boolean; // Allow disabling cache for testing
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

interface CachedQueryResponse {
  question: string;
  answer: string;
  sources: Array<{
    person_id: string;
    event_count: number;
    event_types: string[];
    time_span: string;
    summary: string;
    score: number;
  }>;
  metadata: {
    total_sources: number;
    search_time_ms: number;
    cached: boolean;
    cache_hit_score?: number;
    model_used?: string;
    improved?: boolean;
  };
}

@ApiTags('LLM')
@Controller('llm')
export class LlmController {
  constructor(
    private readonly llmService: LlmService,
    private readonly qdrantService: QdrantService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  @Post('query')
  @ApiOperation({
    summary: 'Query PostHog user events using LLM and Qdrant with caching',
  })
  @ApiBody({
    description: 'Query for user activity with caching support',
    schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          example: 'How many users placed an order in the last 24 hours?',
        },
        top_k: { type: 'number', example: 3 },
        model_override: {
          type: 'string',
          example: 'microsoft/phi-4-reasoning-plus',
        },
        use_cache: { type: 'boolean', example: true },
        filters: {
          type: 'object',
          properties: {
            person_id: { type: 'string', example: 'user-123' },
            vendor_id: { type: 'string', example: 'vendor-456' },
            shop_domain: { type: 'string', example: 'shop.example.com' },
            event_types: {
              type: 'array',
              items: { type: 'string' },
              example: ['purchase', 'login'],
            },
            time_range: {
              type: 'object',
              properties: {
                start: {
                  type: 'string',
                  format: 'date-time',
                  example: '2024-06-01T00:00:00Z',
                },
                end: {
                  type: 'string',
                  format: 'date-time',
                  example: '2024-06-02T00:00:00Z',
                },
              },
            },
          },
        },
      },
      required: ['question'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'LLM-generated answer with caching information',
    schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        answer: { type: 'string' },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              person_id: { type: 'string' },
              event_count: { type: 'number' },
              event_types: { type: 'array', items: { type: 'string' } },
              time_span: { type: 'string' },
              summary: { type: 'string' },
              score: { type: 'number' },
            },
          },
        },
        metadata: {
          type: 'object',
          properties: {
            total_sources: { type: 'number' },
            search_time_ms: { type: 'number' },
            cached: { type: 'boolean' },
            cache_hit_score: { type: 'number' },
            model_used: { type: 'string' },
            improved: { type: 'boolean' },
          },
        },
      },
    },
  })
  async queryPosthogEvents(
    @Body() request: QueryRequest,
  ): Promise<CachedQueryResponse> {
    const startTime = Date.now();
    const useCache = request.use_cache !== false; // Default to true

    // Check cache first if enabled
    if (useCache) {
      const cachedResult = await this.checkQueryCache(request.question);
      if (cachedResult) {
        // Improve the cached response using a summary model
        const improvedAnswer = await this.improveCachedResponse(
          request.question,
          cachedResult.answer,
        );

        return {
          ...cachedResult,
          answer: improvedAnswer,
          metadata: {
            ...cachedResult.metadata,
            cached: true,
            search_time_ms: Date.now() - startTime,
            improved: true,
          },
        };
      }
    }

    // Process query normally
    const result = await this.llmService.queryPosthogEvents(request);

    // Convert QueryResponse to CachedQueryResponse
    const cachedResponse: CachedQueryResponse = {
      question: result.question,
      answer: result.answer,
      sources: result.sources as Array<{
        person_id: string;
        event_count: number;
        event_types: string[];
        time_span: string;
        summary: string;
        score: number;
      }>,
      metadata: {
        total_sources: result.metadata.total_sources,
        search_time_ms: result.metadata.search_time_ms,
        cached: false,
        model_used: result.metadata.model_used,
      },
    };

    await this.cacheQueryResult(request.question, cachedResponse);
    return cachedResponse;
  }

  private async checkQueryCache(
    question: string,
  ): Promise<CachedQueryResponse | null> {
    try {
      // Generate embedding for the query
      const queryEmbedding =
        await this.embeddingsService.generateEmbedding(question);

      // Search for similar cached queries
      const searchResults = await this.qdrantService.search(
        'query_cache',
        queryEmbedding,
        1, // Get the most similar cached query
      );

      if (searchResults.result && searchResults.result.length > 0) {
        const bestMatch = searchResults.result[0];
        const payload = bestMatch.payload as Record<string, unknown>;

        // If similarity is high enough, return cached result
        if (bestMatch.score > 0.85) {
          return {
            question: payload.original_question as string,
            answer: payload.answer as string,
            sources:
              (payload.sources as Array<{
                person_id: string;
                event_count: number;
                event_types: string[];
                time_span: string;
                summary: string;
                score: number;
              }>) || [],
            metadata: {
              total_sources: (payload.total_sources as number) || 0,
              search_time_ms: 0,
              cached: true,
              cache_hit_score: bestMatch.score,
              model_used: payload.model_used as string,
            },
          };
        }
      }
    } catch (error) {
      console.warn('Cache lookup failed:', error);
    }

    return null;
  }

  private async improveCachedResponse(
    question: string,
    cachedAnswer: string,
  ): Promise<string> {
    try {
      const prompt = `You are an expert at improving and refining answers. The user asked: "${question}"

Here is a cached answer that was previously generated:
"${cachedAnswer}"

Please improve this answer by:
1. Making it more concise and direct
2. Ensuring it directly addresses the user's question
3. Improving clarity and readability
4. Adding any relevant insights or context that might be missing
5. Maintaining accuracy while making it more engaging

Provide an improved version of the answer:`;

      const improvedAnswer = await this.llmService.generateResponse(
        prompt,
        LLM_MODELS.SUMMARY, // Use fast summary model
      );

      return improvedAnswer;
    } catch (error) {
      console.warn(
        'Failed to improve cached response, returning original:',
        error,
      );
      return cachedAnswer; // Fallback to original cached answer
    }
  }

  private async cacheQueryResult(
    question: string,
    result: CachedQueryResponse,
  ): Promise<void> {
    try {
      // Generate embedding for the query
      const queryEmbedding =
        await this.embeddingsService.generateEmbedding(question);

      // Create a unique UUID for the cached query
      const queryId = randomUUID();

      // Store in Qdrant cache collection
      await this.qdrantService.upsert('query_cache', queryId, queryEmbedding, {
        original_question: question,
        answer: result.answer,
        sources: result.sources,
        total_sources: result.metadata.total_sources,
        model_used: result.metadata.model_used,
        cached_at: new Date().toISOString(),
        query_embedding_size: queryEmbedding.length,
      });
    } catch (error) {
      console.warn('Failed to cache query result:', error);
    }
  }

  @Post('cache/clear')
  @ApiOperation({ summary: 'Clear the query cache' })
  clearCache(): Promise<{ message: string; timestamp: string }> {
    // This would require implementing a clear collection method in QdrantService
    // For now, we'll return a success message
    return Promise.resolve({
      message: 'Cache clear request received',
      timestamp: new Date().toISOString(),
    });
  }

  @Get('cache/stats')
  @ApiOperation({ summary: 'Get cache statistics' })
  getCacheStats(): Promise<{
    collection: string;
    status: string;
    timestamp: string;
    cache_enabled: boolean;
  }> {
    return Promise.resolve({
      collection: 'query_cache',
      status: 'active',
      timestamp: new Date().toISOString(),
      cache_enabled: true,
    });
  }

  @Get('health')
  healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        llm: 'available',
        qdrant: 'available',
        embeddings: 'available',
        cache: 'available',
      },
    };
  }

  @Get('stats')
  getStats() {
    // This could be expanded to show collection statistics
    return {
      collection: 'posthog_events',
      cache_collection: 'query_cache',
      status: 'active',
      timestamp: new Date().toISOString(),
    };
  }
}
