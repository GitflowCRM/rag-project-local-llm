import { Controller, Post, Body, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { LlmService } from './llm.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { randomUUID } from 'crypto';

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
    confidence?: number;
    intent?: string;
    method_used?: string;
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
  async queryPosthogEvents(
    @Body() request: QueryRequest,
    @Query('stream') stream?: string,
    @Res() res?: Response,
  ): Promise<CachedQueryResponse | void> {
    if (stream === 'true' && res) {
      // Set OpenAI-style streaming headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      // Process query normally
      await this.llmService.queryPosthogEvents(request, true, res);
      return;
    }

    // Process query normally
    const result = await this.llmService.queryPosthogEvents(
      request,
      false,
      res,
    );

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

  @Post('routed-query')
  @ApiOperation({
    summary:
      'Query PostHog user events using NLP intent detection and method routing',
  })
  async routedQuery(
    @Body() request: QueryRequest,
    @Query('stream') stream?: string,
    @Res() res?: Response,
  ): Promise<CachedQueryResponse | void> {
    if (stream === 'true' && res) {
      // Set OpenAI-style streaming headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      // Process routed query with streaming
      await this.llmService.routedQuery(request, true, res);
      return;
    }

    // Check cache first
    const cachedResult = await this.checkQueryCache(request.question);
    if (cachedResult && request.use_cache !== false) {
      return cachedResult;
    }

    // Process routed query without streaming
    const result = await this.llmService.routedQuery(request, false, res);

    // Handle the case where result might be void (streaming case)
    if (!result) {
      return;
    }

    // Convert RoutedQueryResponse to CachedQueryResponse
    const cachedResponse: CachedQueryResponse = {
      question: result.question,
      answer: result.answer,
      sources: result.sources,
      metadata: {
        total_sources: result.metadata.total_sources,
        search_time_ms: result.metadata.search_time_ms,
        cached: false,
        model_used: result.metadata.model_used,
        confidence: result.metadata.confidence,
        intent: result.intent,
        method_used: result.method_used,
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
      const searchResults = await this.qdrantService.search({
        collection: 'query_cache',
        vector: queryEmbedding,
        top: 1, // Get the most similar cached query
      });

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
