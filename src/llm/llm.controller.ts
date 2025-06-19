import { Controller, Post, Body, Get } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

interface QueryRequest {
  question: string;
  top_k?: number;
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

@ApiTags('LLM')
@Controller('llm')
export class LlmController {
  constructor(private readonly llmService: LlmService) {}

  @Post('query')
  @ApiOperation({ summary: 'Query PostHog user events using LLM and Qdrant' })
  @ApiBody({
    description: 'Query for user activity',
    schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          example: 'How many users placed an order in the last 24 hours?',
        },
        top_k: { type: 'number', example: 3 },
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
    description: 'LLM-generated answer with relevant user activity context',
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
          },
        },
      },
    },
  })
  async queryPosthogEvents(@Body() request: QueryRequest): Promise<any> {
    return this.llmService.queryPosthogEvents(request);
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
      },
    };
  }

  @Get('stats')
  getStats() {
    // This could be expanded to show collection statistics
    return {
      collection: 'posthog_events',
      status: 'active',
      timestamp: new Date().toISOString(),
    };
  }
}
