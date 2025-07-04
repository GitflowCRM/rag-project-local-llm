import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import { catchError, firstValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Event } from '../events/entities/event.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { LlmService } from '../llm/llm.service';
import { LLM_MODELS } from 'src/queue/const';

interface QdrantPoint {
  id: number;
  vector: number[];
  payload: {
    user_id: string;
    event_type: string;
    event_data: Record<string, any>;
    event_timestamp: string | Date;
  };
}

export interface QdrantSearchResult {
  result: Array<{
    id: number;
    score: number;
    payload: QdrantPoint['payload'];
  }>;
}

interface QdrantHealthResponse {
  title: string;
  version: string;
  status: string;
}

interface QdrantCollectionInfo {
  name: string;
  vectors_count: number;
  points_count: number;
  segments_count: number;
  config: {
    params: {
      vectors: {
        size: number;
        distance: string;
      };
    };
  };
}

interface QdrantCollectionsResponse {
  collections: QdrantCollectionInfo[];
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);
  private readonly baseUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  private readonly vectorSize = 1536; // OpenAI embedding size
  private readonly eventCollection = 'events';
  private readonly posthogEventsCollection = 'posthog_events';
  private readonly queryCacheCollection = 'query_cache';

  constructor(
    private readonly httpService: HttpService,
    @InjectRepository(Event)
    private readonly eventRepo: Repository<Event>,
    private readonly embeddingsService: EmbeddingsService,
    @Inject(forwardRef(() => LlmService))
    private readonly llmService: LlmService,
  ) {}

  async onModuleInit() {
    try {
      await this.checkQdrantHealth();
      await this.ensureCollectionExists(this.eventCollection);
      await this.ensureCollectionExists(this.posthogEventsCollection);
      await this.ensureCollectionExists(this.queryCacheCollection);
      this.logger.log('Qdrant service initialized successfully');
    } catch (error) {
      this.logger.error(
        `Failed to initialize Qdrant service: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private async checkQdrantHealth() {
    try {
      const healthUrl = `${this.baseUrl}/healthz`;
      const rs = await firstValueFrom(
        this.httpService.get<QdrantHealthResponse>(healthUrl).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `Qdrant health check failed: ${JSON.stringify(error.response?.data)}`,
            );
            throw new Error(`Qdrant health check failed: ${error.message}`);
          }),
        ),
      );
      this.logger.log('Qdrant health check passed');
      return rs;
    } catch (error) {
      this.logger.error(
        `Qdrant health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error(
        'Failed to connect to Qdrant. Please ensure it is running and accessible.',
      );
    }
  }

  private async ensureCollectionExists(collection: string) {
    try {
      // Check if collection exists
      const checkUrl = `${this.baseUrl}/collections/${collection}`;
      const rs = await firstValueFrom(
        this.httpService.get<QdrantCollectionInfo>(checkUrl).pipe(
          catchError((error: AxiosError) => {
            if (error.response?.status === 404) {
              // Collection doesn't exist, create it
              return this.createCollection(collection);
            }
            const errorMessage = error.response?.data
              ? JSON.stringify(error.response.data)
              : error.message;
            this.logger.error(`Failed to check collection: ${errorMessage}`);
            throw new Error(`Failed to check collection: ${errorMessage}`);
          }),
        ),
      );
      this.logger.log(`Collection ${collection} exists`);
      return rs;
    } catch (error) {
      this.logger.error(
        `Failed to ensure collection exists: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error(
        `Failed to ensure collection exists: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async createCollection(collection: string) {
    const createUrl = `${this.baseUrl}/collections/${collection}`;
    const body = {
      vectors: {
        size: this.vectorSize,
        distance: 'Cosine',
      },
    };

    try {
      await firstValueFrom(
        this.httpService.put(createUrl, body).pipe(
          catchError((error: AxiosError) => {
            const errorMessage = error.response?.data
              ? JSON.stringify(error.response.data)
              : error.message;
            this.logger.error(`Failed to create collection: ${errorMessage}`);
            throw new Error(`Failed to create collection: ${errorMessage}`);
          }),
        ),
      );
      this.logger.log(`Created collection: ${collection}`);
    } catch (error) {
      this.logger.error(
        `Error creating collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async ingestAllEventsToQdrant(collection: string) {
    try {
      await this.ensureCollectionExists(collection);

      const events = await this.eventRepo.find({
        where: { ingested_at: IsNull() },
      });

      if (!events.length) {
        this.logger.log('No new events to ingest');
        return { ingested: 0 };
      }

      let count = 0;
      for (const event of events) {
        try {
          // Generate embedding for the event
          const embedding = await this.embeddingsService.generateEmbedding(
            JSON.stringify(event.event_data),
          );

          await this.upsert(collection, event.id.toString(), embedding, {
            user_id: event.user_id,
            event_type: event.event_type,
            event_data: event.event_data,
            event_timestamp: event.event_timestamp,
          });

          event.ingested_at = new Date();
          await this.eventRepo.save(event);
          count++;
        } catch (error) {
          this.logger.error(
            `Failed to ingest event ${event.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
          // Continue with next event instead of failing completely
          continue;
        }
      }
      return { ingested: count };
    } catch (error) {
      this.logger.error(
        `Ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new Error(
        `Ingestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async upsert(
    collection: string,
    id: string,
    vector: number[],
    payload: Record<string, any>,
  ): Promise<any> {
    const url = `${this.baseUrl}/collections/${collection}/points`;
    const body = {
      points: [
        {
          id: id, // Use UUID string directly instead of converting to integer
          vector,
          payload,
        },
      ],
    };

    try {
      this.logger.debug(
        `Upserting point to collection ${collection}: ${JSON.stringify(body)}`,
      );
      const response = await firstValueFrom(
        this.httpService.put(url, body).pipe(
          catchError((error: AxiosError) => {
            const errorMessage = error.response?.data
              ? JSON.stringify(error.response.data)
              : error.message;
            this.logger.error(`Qdrant upsert error: ${errorMessage}`);
            throw new Error(`Qdrant upsert error: ${errorMessage}`);
          }),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to upsert point: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async search({
    collection,
    vector,
    top = 5,
    filter,
    with_payload = false,
    with_vectors = false,
  }: {
    collection: string;
    vector: number[];
    top?: number;
    filter?: any;
    with_payload?: boolean;
    with_vectors?: boolean;
  }): Promise<QdrantSearchResult> {
    const url = `${this.baseUrl}/collections/${collection}/points/search`;
    const body: Record<string, unknown> = {
      vector,
      limit: top,
      with_payload,
      with_vectors,
    };
    if (filter) {
      body.filter = filter;
    }

    try {
      this.logger.debug(
        `Searching collection ${collection} with vector of length ${vector.length}` +
          (filter ? ` and filter: ${JSON.stringify(filter)}` : ''),
      );
      const response = await firstValueFrom(
        this.httpService.post<QdrantSearchResult>(url, body).pipe(
          catchError((error: AxiosError) => {
            const errorMessage = error.response?.data
              ? JSON.stringify(error.response.data)
              : error.message;
            this.logger.error(`Qdrant search error: ${errorMessage}`);
            throw new Error(`Qdrant search error: ${errorMessage}`);
          }),
        ),
      );
      this.logger.debug(`Search results: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to search: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      const generatedCurl = `curl -X POST ${url} -H "Content-Type: application/json" -d '${JSON.stringify(body)}'`;
      this.logger.debug(`Generated curl: ${generatedCurl}`);
      throw error;
    }
  }

  async semanticSearch(
    collection: string,
    query: string,
    top = 5,
  ): Promise<{
    query: string;
    results: Array<{
      id: number;
      score: number;
      payload: QdrantPoint['payload'];
    }>;
  }> {
    try {
      const embedding = await this.embeddingsService.generateEmbedding(query);
      this.logger.debug(`Generated embedding for query: "${query}"`);

      const results = await this.search({
        collection,
        vector: embedding,
        top,
        with_payload: true,
        with_vectors: false,
      });
      this.logger.debug(`Raw search results: ${JSON.stringify(results)}`);

      const formattedResults = {
        query,
        results: results.result.map((item) => ({
          id: item.id,
          score: item.score,
          payload: item.payload,
        })),
      };

      this.logger.debug(
        `Formatted results: ${JSON.stringify(formattedResults)}`,
      );
      return formattedResults;
    } catch (error) {
      this.logger.error(
        `Failed to perform semantic search: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async ragSearch(
    collection: string,
    query: string,
    top = 3,
  ): Promise<{
    query: string;
    answer: string;
    sources: Array<{
      id: number;
      score: number;
      payload: QdrantPoint['payload'];
    }>;
  }> {
    try {
      // 1. Get relevant documents through semantic search
      const searchResults = await this.semanticSearch(collection, query, top);

      // 2. Format context from search results
      const context = searchResults.results
        .map((result) => {
          const data = result.payload.event_data;
          return `Topic: ${data.topic}\nFact: ${data.fact}\nSource: ${data.source}\n`;
        })
        .join('\n');

      // 3. Generate prompt for LLM
      const prompt = `Based on the following historical facts, please answer the question. If the facts don't contain enough information to answer the question, say so.

Context:
${context}

Question: ${query}

Answer:`;

      // 4. Get answer from LLM
      const answer = await this.llmService.generateResponse({
        prompt,
        modelOverride: LLM_MODELS.REASONING,
        stream: false,
      });

      if (typeof answer !== 'string') {
        throw new Error('Expected string answer from LLM, got void');
      }

      return {
        query,
        answer,
        sources: searchResults.results,
      };
    } catch (error) {
      this.logger.error(
        `RAG search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async getHealth(): Promise<{
    status: string;
    title?: string;
    version?: string;
    error?: string;
  }> {
    try {
      const healthUrl = `${this.baseUrl}/healthz`;
      const response = await firstValueFrom(
        this.httpService.get<QdrantHealthResponse>(healthUrl).pipe(
          catchError((error: AxiosError) => {
            this.logger.error('Health check failed:', error);
            throw error;
          }),
        ),
      );
      return { status: 'healthy', ...response.data };
    } catch (error) {
      this.logger.error('Health check failed:', error);
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getCollections(): Promise<QdrantCollectionsResponse> {
    try {
      const collectionsUrl = `${this.baseUrl}/collections`;
      const response = await firstValueFrom(
        this.httpService.get<QdrantCollectionsResponse>(collectionsUrl).pipe(
          catchError((error: AxiosError) => {
            this.logger.error('Failed to get collections:', error);
            throw error;
          }),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get collections:', error);
      throw error;
    }
  }

  async getCollectionStats(
    collectionName: string,
  ): Promise<QdrantCollectionInfo> {
    try {
      const statsUrl = `${this.baseUrl}/collections/${collectionName}`;
      const response = await firstValueFrom(
        this.httpService.get<QdrantCollectionInfo>(statsUrl).pipe(
          catchError((error: AxiosError) => {
            this.logger.error(
              `Failed to get stats for collection ${collectionName}:`,
              error,
            );
            throw error;
          }),
        ),
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        `Failed to get stats for collection ${collectionName}:`,
        error,
      );
      throw error;
    }
  }

  async getCollectionCount(collectionName: string): Promise<{
    collection: string;
    count: number;
    vectors_count: number;
  }> {
    try {
      const info: QdrantCollectionInfo =
        await this.getCollectionStats(collectionName);
      return {
        collection: collectionName,
        count: info.points_count,
        vectors_count: info.vectors_count,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get count for collection ${collectionName}:`,
        error,
      );
      throw error;
    }
  }
}
