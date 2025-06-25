import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { LLM_MODELS } from '../queue/const';
import {
  FILTER_USERS_BY_TRAITS_PROMPT,
  INTENT_DETECTION_PROMPT,
  COUNT_USERS_SUMMARY_PROMPT,
  FIND_IOS_USERS_SUMMARY_PROMPT,
  LIST_USERS_SUMMARY_PROMPT,
} from 'src/prompts';
import { Response } from 'express';

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

// New interfaces for NLP method router
interface IntentDetectionResponse {
  intent: string;
  confidence: number;
  parameters: Record<string, any>;
  method: string;
}

interface RoutedQueryRequest {
  question: string;
  top_k?: number;
  model_override?: string;
  use_cache?: boolean;
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

interface RoutedQueryResponse {
  question: string;
  answer: string;
  intent: string;
  method_used: string;
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
    confidence: number;
  };
}

@Injectable()
export class LlmService {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly qdrantService: QdrantService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly logger: Logger,
  ) {
    this.apiUrl = this.configService.get<string>('LLM_API_URL') || '';
    this.apiKey = this.configService.get<string>('LLM_API_KEY') || '';
    this.model = this.configService.get<string>('LLM_MODEL') || '';
    this.temperature = this.configService.get<number>('LLM_TEMPERATURE') || 0.2;
    this.maxTokens = this.configService.get<number>('LLM_MAX_TOKENS') || 4096;
  }

  async generateResponse({
    prompt,
    modelOverride,
    stream,
    res,
  }: {
    prompt: string;
    modelOverride?: string;
    stream: boolean;
    res?: Response;
  }): Promise<string | void> {
    try {
      const modelToUse = modelOverride || this.model;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      this.logger.log(`Calling LLM with question: ${prompt}`);
      const promptLength = prompt.length;
      this.logger.log(`Prompt length: ${promptLength}`);
      if (promptLength > 10000) {
        this.logger.log(`Prompt length is too long: ${promptLength}`);
        throw new Error('Prompt length is too long');
      }

      if (stream) {
        // Use fetch for streaming
        const fetchResponse = await fetch(`${this.apiUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: modelToUse,
            temperature: Number(this.temperature),
            stream: true,
            max_tokens: Number(this.maxTokens),
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          }),
        });
        if (!fetchResponse.body)
          throw new Error('No response body for streaming');
        const reader = fetchResponse.body.getReader();
        let done = false;
        // accumulator for the message and always write to the response
        let aiChatMessage = '';
        while (!done) {
          const { value, done: streamDone } = await reader.read();
          if (value) {
            const chunk = Buffer.from(value).toString('utf8');
            this.logger.log(`[LLM Stream] ${chunk}`);
            if (res) res.write(chunk);
            aiChatMessage += chunk;
          }
          done = streamDone;
        }
        this.logger.log(`[LLM Stream] Final message: ${aiChatMessage}`);
        if (res) res.write(aiChatMessage);
        if (res) res.end();
        return;
      } else {
        // Non-streaming: use axios
        const response = await axios.post<LLMResponse>(
          `${this.apiUrl}/chat/completions`,
          {
            model: modelToUse,
            temperature: Number(this.temperature),
            stream: false,
            max_tokens: Number(this.maxTokens),
            messages: [
              {
                role: 'user',
                content: prompt,
              },
            ],
          },
          {
            headers,
          },
        );
        return response.data.choices[0].message.content;
      }
    } catch (error) {
      console.error('Error calling LLM:', error);
      throw new Error('Failed to generate response from LLM');
    }
  }

  async queryPosthogEvents(
    request: QueryRequest,
    stream: boolean,
    res: Response,
  ): Promise<QueryResponse> {
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
    // const prompt = DATA_ANALYSIS_PROMPT(context);
    const prompt = FILTER_USERS_BY_TRAITS_PROMPT({
      question: request.question,
      userProfiles: context,
    });
    await this.generateResponse({
      prompt,
      modelOverride: LLM_MODELS.REASONING,
      stream,
      res,
    });
    return;
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

  // NLP Method Router - Intent Detection
  async detectIntent(question: string): Promise<IntentDetectionResponse> {
    const intentPrompt = INTENT_DETECTION_PROMPT(question);

    try {
      const response = await this.generateResponse({
        prompt: intentPrompt,
        modelOverride: LLM_MODELS.SUMMARY,
        stream: false,
      });

      if (typeof response === 'string') {
        // Extract JSON from markdown code blocks using regex
        const jsonMatch = response.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
        const jsonString = jsonMatch ? jsonMatch[1] : response;

        try {
          const parsed = JSON.parse(jsonString.trim()) as {
            intent: string;
            confidence: number;
            parameters: Record<string, any>;
            method: string;
          };
          return {
            intent: parsed.intent,
            confidence: parsed.confidence,
            parameters: parsed.parameters || {},
            method: parsed.method,
          };
        } catch (error) {
          this.logger.error('Failed to parse intent response:', error);
          throw new Error('Invalid response format');
        }
      }
      throw new Error('Invalid response format');
    } catch (error) {
      this.logger.error('Intent detection failed:', error);
      // Fallback to general query
      return {
        intent: 'general_query',
        confidence: 0.5,
        parameters: {},
        method: 'queryPosthogEvents',
      };
    }
  }

  // Specific Task Methods
  async countUsers(
    parameters: Record<string, any>,
    stream: boolean = false,
    res?: Response,
  ): Promise<RoutedQueryResponse | void> {
    const startTime = Date.now();

    // Build search query based on parameters
    let searchQuery = 'count users';
    if (parameters.device_type) {
      searchQuery += ` using ${parameters.device_type}`;
    }
    if (parameters.location) {
      searchQuery += ` from ${parameters.location}`;
    }
    if (parameters.time_period) {
      searchQuery += ` in ${parameters.time_period}`;
    }

    // Get relevant user data
    const queryEmbedding =
      await this.embeddingsService.generateEmbedding(searchQuery);
    const searchResults = await this.qdrantService.search(
      'posthog_events',
      queryEmbedding,
      10,
    );

    if (!searchResults.result || searchResults.result.length === 0) {
      const result = {
        question: searchQuery,
        answer: 'No users found matching the criteria.',
        intent: 'count_users',
        method_used: 'countUsers',
        sources: [],
        metadata: {
          total_sources: 0,
          search_time_ms: Date.now() - startTime,
          cached: false,
          model_used: LLM_MODELS.SUMMARY,
          confidence: 1.0,
        },
      };

      if (stream && res) {
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        res.end();
        return;
      }
      return result;
    }

    // Count unique users
    const uniqueUsers = new Set();
    searchResults.result.forEach((result) => {
      const payload = result.payload as unknown as PosthogEventPayload;
      uniqueUsers.add(payload.person_id);
    });

    const count = uniqueUsers.size;

    // Prepare context for LLM summarization
    const context = this.prepareContext(searchResults.result.slice(0, 3));
    const summaryPrompt = COUNT_USERS_SUMMARY_PROMPT({
      question: searchQuery,
      context,
      count,
    });

    // Generate LLM response
    if (stream && res) {
      // Stream the response
      await this.generateResponse({
        prompt: summaryPrompt,
        modelOverride: LLM_MODELS.SUMMARY,
        stream: true,
        res,
      });
      return;
    } else {
      // Get non-streaming response
      const llmAnswer = await this.generateResponse({
        prompt: summaryPrompt,
        modelOverride: LLM_MODELS.SUMMARY,
        stream: false,
      });

      const result = {
        question: searchQuery,
        answer:
          typeof llmAnswer === 'string'
            ? llmAnswer
            : `Found ${count} unique users${parameters.device_type ? ` using ${parameters.device_type}` : ''}${parameters.location ? ` from ${parameters.location}` : ''}${parameters.time_period ? ` in ${parameters.time_period}` : ''}.`,
        intent: 'count_users',
        method_used: 'countUsers',
        sources: searchResults.result.slice(0, 3).map((result) => {
          const payload = result.payload as unknown as PosthogEventPayload;
          return {
            person_id: payload.person_id,
            event_count: payload.event_count,
            event_types: payload.event_types,
            time_span: payload.time_span,
            summary: payload.summary || 'User profile data',
            score: result.score,
          };
        }),
        metadata: {
          total_sources: searchResults.result.length,
          search_time_ms: Date.now() - startTime,
          cached: false,
          model_used: LLM_MODELS.SUMMARY,
          confidence: 0.95,
        },
      };

      return result;
    }
  }

  async findIosUsers(
    parameters: Record<string, any>,
    stream: boolean = false,
    res?: Response,
  ): Promise<RoutedQueryResponse | void> {
    const startTime = Date.now();

    // Build search query for iOS users
    let searchQuery = 'iOS users iPhone iPad';
    if (parameters.location) {
      searchQuery += ` from ${parameters.location}`;
    }
    if (parameters.time_period) {
      searchQuery += ` in ${parameters.time_period}`;
    }

    const queryEmbedding =
      await this.embeddingsService.generateEmbedding(searchQuery);
    const searchResults = await this.qdrantService.search(
      'posthog_events',
      queryEmbedding,
      10,
    );

    if (!searchResults.result || searchResults.result.length === 0) {
      const result = {
        question: searchQuery,
        answer: 'No iOS users found.',
        intent: 'find_ios_users',
        method_used: 'findIosUsers',
        sources: [],
        metadata: {
          total_sources: 0,
          search_time_ms: Date.now() - startTime,
          cached: false,
          model_used: LLM_MODELS.SUMMARY,
          confidence: 1.0,
        },
      };

      if (stream && res) {
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        res.end();
        return;
      }
      return result;
    }

    // Filter for iOS users
    const iosUsers = searchResults.result.filter((result) => {
      const payload = result.payload as unknown as PosthogEventPayload;
      const flattened = payload.flattened_data || {};
      const os = flattened.os?.[0] || '';
      const deviceName = flattened.device_name?.[0] || '';
      return (
        os.toLowerCase().includes('ios') ||
        deviceName.toLowerCase().includes('iphone') ||
        deviceName.toLowerCase().includes('ipad')
      );
    });

    // Prepare context for LLM summarization
    const context = this.prepareContext(iosUsers.slice(0, 3));
    const summaryPrompt = FIND_IOS_USERS_SUMMARY_PROMPT({
      question: searchQuery,
      context,
      count: iosUsers.length,
    });

    // Generate LLM response
    if (stream && res) {
      // Stream the response
      await this.generateResponse({
        prompt: summaryPrompt,
        modelOverride: LLM_MODELS.SUMMARY,
        stream: true,
        res,
      });
      return;
    } else {
      // Get non-streaming response
      const llmAnswer = await this.generateResponse({
        prompt: summaryPrompt,
        modelOverride: LLM_MODELS.SUMMARY,
        stream: false,
      });

      const result = {
        question: searchQuery,
        answer:
          typeof llmAnswer === 'string'
            ? llmAnswer
            : `Found ${iosUsers.length} iOS users${parameters.location ? ` from ${parameters.location}` : ''}${parameters.time_period ? ` in ${parameters.time_period}` : ''}.`,
        intent: 'find_ios_users',
        method_used: 'findIosUsers',
        sources: iosUsers.slice(0, 3).map((result) => {
          const payload = result.payload as unknown as PosthogEventPayload;
          return {
            person_id: payload.person_id,
            event_count: payload.event_count,
            event_types: payload.event_types,
            time_span: payload.time_span,
            summary: payload.summary || 'iOS user profile',
            score: result.score,
          };
        }),
        metadata: {
          total_sources: iosUsers.length,
          search_time_ms: Date.now() - startTime,
          cached: false,
          model_used: LLM_MODELS.SUMMARY,
          confidence: 0.9,
        },
      };

      return result;
    }
  }

  async listUsers(
    parameters: Record<string, any>,
    stream: boolean = false,
    res?: Response,
  ): Promise<RoutedQueryResponse | void> {
    const startTime = Date.now();

    // Build search query
    let searchQuery = 'list users';
    if (parameters.device_type) {
      searchQuery += ` using ${parameters.device_type}`;
    }
    if (parameters.location) {
      searchQuery += ` from ${parameters.location}`;
    }
    if (parameters.activity_type) {
      searchQuery += ` who are ${parameters.activity_type}`;
    }

    const queryEmbedding =
      await this.embeddingsService.generateEmbedding(searchQuery);
    const searchResults = await this.qdrantService.search(
      'posthog_events',
      queryEmbedding,
      10,
    );

    if (!searchResults.result || searchResults.result.length === 0) {
      const result = {
        question: searchQuery,
        answer: 'No users found matching the criteria.',
        intent: 'list_users',
        method_used: 'listUsers',
        sources: [],
        metadata: {
          total_sources: 0,
          search_time_ms: Date.now() - startTime,
          cached: false,
          model_used: LLM_MODELS.SUMMARY,
          confidence: 1.0,
        },
      };

      if (stream && res) {
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        res.end();
        return;
      }
      return result;
    }

    // Prepare context for LLM summarization
    const context = this.prepareContext(searchResults.result.slice(0, 3));
    const summaryPrompt = LIST_USERS_SUMMARY_PROMPT({
      question: searchQuery,
      context,
      count: searchResults.result.length,
    });

    // Generate LLM response
    if (stream && res) {
      // Stream the response
      await this.generateResponse({
        prompt: summaryPrompt,
        modelOverride: LLM_MODELS.SUMMARY,
        stream: true,
        res,
      });
      return;
    } else {
      // Get non-streaming response
      const llmAnswer = await this.generateResponse({
        prompt: summaryPrompt,
        modelOverride: LLM_MODELS.SUMMARY,
        stream: false,
      });

      const result = {
        question: searchQuery,
        answer:
          typeof llmAnswer === 'string'
            ? llmAnswer
            : `Found ${searchResults.result.length} users${parameters.device_type ? ` using ${parameters.device_type}` : ''}${parameters.location ? ` from ${parameters.location}` : ''}${parameters.activity_type ? ` who are ${parameters.activity_type}` : ''}.`,
        intent: 'list_users',
        method_used: 'listUsers',
        sources: searchResults.result.slice(0, 3).map((result) => {
          const payload = result.payload as unknown as PosthogEventPayload;
          return {
            person_id: payload.person_id,
            event_count: payload.event_count,
            event_types: payload.event_types,
            time_span: payload.time_span,
            summary: payload.summary || 'User profile',
            score: result.score,
          };
        }),
        metadata: {
          total_sources: searchResults.result.length,
          search_time_ms: Date.now() - startTime,
          cached: false,
          model_used: LLM_MODELS.SUMMARY,
          confidence: 0.9,
        },
      };

      return result;
    }
  }

  // Main routed query method
  async routedQuery(
    request: RoutedQueryRequest,
    stream: boolean = false,
    res?: Response,
  ): Promise<RoutedQueryResponse | void> {
    const startTime = Date.now();

    // 1. Detect intent
    const intentResult = await this.detectIntent(request.question);

    // 2. Route to appropriate method based on intent
    let result: RoutedQueryResponse | void;

    switch (intentResult.intent) {
      case 'count_users':
        result = await this.countUsers(intentResult.parameters, stream, res);
        break;
      case 'find_ios_users':
        result = await this.findIosUsers(intentResult.parameters, stream, res);
        break;
      case 'list_users':
        result = await this.listUsers(intentResult.parameters, stream, res);
        break;
      case 'general_query':
        // Pass question directly to LLM without RAG processing
        if (stream && res) {
          await this.generateResponse({
            prompt: request.question,
            modelOverride: LLM_MODELS.REASONING,
            stream: true,
            res,
          });
          return;
        } else {
          const llmAnswer = await this.generateResponse({
            prompt: request.question,
            modelOverride: LLM_MODELS.REASONING,
            stream: false,
          });

          result = {
            question: request.question,
            answer:
              typeof llmAnswer === 'string'
                ? llmAnswer
                : 'No response generated',
            intent: 'general_query',
            method_used: 'direct_llm',
            sources: [],
            metadata: {
              total_sources: 0,
              search_time_ms: Date.now() - startTime,
              cached: false,
              model_used: LLM_MODELS.REASONING,
              confidence: intentResult.confidence,
            },
          };
        }
        break;
      default:
        // Fallback to general query
        if (stream && res) {
          await this.queryPosthogEvents(request, true, res);
          return;
        } else {
          const generalResult = await this.queryPosthogEvents(
            request,
            false,
            undefined,
          );
          result = {
            question: request.question,
            answer: generalResult.answer,
            intent: 'general_query',
            method_used: 'queryPosthogEvents',
            sources: generalResult.sources.map((source) => ({
              person_id: source.person_id,
              event_count: 0,
              event_types: [],
              time_span: '',
              summary: source.summary,
              score: source.score,
            })),
            metadata: {
              total_sources: generalResult.metadata.total_sources,
              search_time_ms: generalResult.metadata.search_time_ms,
              cached: false,
              model_used: generalResult.metadata.model_used,
              confidence: intentResult.confidence,
            },
          };
        }
    }

    // Update metadata with intent detection info (only for non-streaming)
    if (result && !stream) {
      result.metadata.search_time_ms = Date.now() - startTime;
      result.metadata.confidence = intentResult.confidence;
    }

    return result;
  }
}
