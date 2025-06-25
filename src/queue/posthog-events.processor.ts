import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PosthogEventsService } from '../events/posthog-events.service';
import { IngestionAttemptsService } from '../events/ingestion-attempts.service';
import { FailureReason } from '../events/entities/ingestion-attempt.entity';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { LlmService } from '../llm/llm.service';
import { LLM_MODELS, QUEUE_NAMES, QUEUE_PROCESSORS } from './const';
import { Logger } from '@nestjs/common';
import { PosthogEvent } from '../events/entities/posthog-event.entity';
import { InjectQueue } from '@nestjs/bull';
import { USER_SUMMARY_PROMPT } from 'src/prompts';

interface FindUsersJobData {
  batchSize: number;
}

interface ProcessUserJobData {
  person_id: string;
  person_properties: Record<string, any>;
}

@Processor(QUEUE_NAMES.POSTHOG_EVENTS, { concurrency: 1 })
export class PosthogEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(PosthogEventsProcessor.name);
  constructor(
    private readonly posthogEventsService: PosthogEventsService,
    private readonly ingestionAttemptsService: IngestionAttemptsService,
    private readonly qdrantService: QdrantService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly llmService: LlmService,
    @InjectQueue(QUEUE_NAMES.POSTHOG_EVENTS)
    private readonly posthogEventsQueue: Queue,
  ) {
    super();
    this.logger.log(
      `BullMQ Processor initialized for queue: ${QUEUE_NAMES.POSTHOG_EVENTS}`,
    );
  }

  async process(
    job: Job<FindUsersJobData | ProcessUserJobData>,
  ): Promise<void> {
    this.logger.log(
      `[PosthogEventsProcessor] Starting job ${job.id} of type ${job.name} with data: ${JSON.stringify(job.data)}`,
    );

    let attemptId: string | null = null;
    const startTime = Date.now();

    try {
      // Create ingestion attempt record
      attemptId = await this.createIngestionAttempt(job);

      switch (job.name) {
        case QUEUE_PROCESSORS.POSTHOG_EVENTS.FIND_USERS:
          await this.handleFindUsers(job.data as FindUsersJobData, attemptId);
          break;
        case QUEUE_PROCESSORS.POSTHOG_EVENTS.PROCESS_USER:
          await this.handleProcessUserEvents(
            job.data as ProcessUserJobData,
            attemptId,
            startTime,
          );
          break;
        default:
          this.logger.warn(
            `[PosthogEventsProcessor] Unhandled job type: ${job.name}`,
          );
      }

      this.logger.log(
        `[PosthogEventsProcessor] Successfully completed job ${job.id}`,
      );
    } catch (error) {
      await this.handleJobError(job, error, attemptId, startTime);
    }
  }

  private async createIngestionAttempt(
    job: Job<FindUsersJobData | ProcessUserJobData>,
  ): Promise<string> {
    const attempt = await this.ingestionAttemptsService.createAttempt({
      person_id: 'person_id' in job.data ? job.data.person_id : undefined,
      job_type: job.name,
      metadata: {
        job_id: job.id,
        job_name: job.name,
        job_data: job.data,
      },
    });
    return attempt.id;
  }

  private async handleJobError(
    job: Job<FindUsersJobData | ProcessUserJobData>,
    error: any,
    attemptId: string | null,
    startTime: number,
  ): Promise<void> {
    const errorMessage =
      typeof error === 'object' && error !== null && 'message' in error
        ? (error as { message: string }).message
        : String(error);

    this.logger.error(
      `[PosthogEventsProcessor] Error processing job ${job.id}: ${errorMessage}`,
      error,
    );

    if (attemptId) {
      const failureReason = this.determineFailureReason(error);
      await this.ingestionAttemptsService.markAsFailed(attemptId, {
        failure_reason: failureReason,
        error_message: errorMessage,
        error_details: {
          job_id: job.id,
          job_name: job.name,
          job_data: job.data,
          stack_trace: (error as { stack?: string })?.stack,
          processing_time_ms: Date.now() - startTime,
        },
      });
    }
  }

  private determineFailureReason(error: any): FailureReason {
    if (
      (error as { message?: string })?.message?.includes('embedding') ||
      (error as { message?: string })?.message?.includes('OpenAI')
    ) {
      return FailureReason.EMBEDDING_GENERATION_FAILED;
    }
    if (
      (error as { message?: string })?.message?.includes('Qdrant') ||
      (error as { message?: string })?.message?.includes('upsert')
    ) {
      return FailureReason.QDRANT_UPSERT_FAILED;
    }
    if (
      (error as { message?: string })?.message?.includes('database') ||
      (error as { message?: string })?.message?.includes('connection')
    ) {
      return FailureReason.DATABASE_ERROR;
    }
    if (
      (error as { message?: string })?.message?.includes('timeout') ||
      (error as { message?: string })?.message?.includes('timed out')
    ) {
      return FailureReason.TIMEOUT;
    }
    return FailureReason.UNKNOWN;
  }

  private async handleFindUsers(data: FindUsersJobData, attemptId: string) {
    const { batchSize } = data;
    this.logger.debug(
      `[PosthogEventsProcessor] Finding users with uningested events (batch size: ${batchSize})`,
    );

    await this.ingestionAttemptsService.markAsProcessing(attemptId);

    // Get all uningested events grouped by user
    const groupedEvents =
      await this.posthogEventsService.findUningestedEventsGroupedByUser(
        batchSize,
      );

    this.logger.log(
      `[PosthogEventsProcessor] Found ${groupedEvents.size} users with uningested events`,
    );

    // For each user, queue a job to process their events
    for (const [person_id, events] of groupedEvents) {
      this.logger.debug(
        `[PosthogEventsProcessor] Queuing job for user ${person_id} with ${events.events.length} events`,
      );
      const person_properties = events.person_properties;

      // Queue a PROCESS_USER job for this specific user
      await this.posthogEventsQueue.add(
        QUEUE_PROCESSORS.POSTHOG_EVENTS.PROCESS_USER,
        { person_id, person_properties },
        {
          // Optional: Add some delay to avoid overwhelming the system
          delay: 1000, // 1 second delay between jobs
        },
      );

      this.logger.log(
        `[PosthogEventsProcessor] Queued PROCESS_USER job for user ${person_id}`,
      );
    }

    await this.ingestionAttemptsService.markAsSuccess(attemptId, {
      events_processed: groupedEvents.size,
      metadata: {
        batch_size: batchSize,
        users_found: groupedEvents.size,
      },
    });
  }

  private async handleProcessUserEvents(
    data: ProcessUserJobData,
    attemptId: string,
    startTime: number,
  ) {
    const { person_id, person_properties } = data;
    this.logger.debug(
      `[PosthogEventsProcessor] Processing events for user ${person_id}`,
    );

    await this.ingestionAttemptsService.markAsProcessing(attemptId);

    // Get all uningested events for this specific user
    const events =
      await this.posthogEventsService.findUningestedEventsForUser(person_id);

    if (events.length === 0) {
      this.logger.debug(
        `[PosthogEventsProcessor] No uningested events found for user ${person_id}`,
      );
      await this.ingestionAttemptsService.markAsSuccess(attemptId, {
        events_processed: 0,
        processing_time_ms: Date.now() - startTime,
      });
      return;
    }

    this.logger.debug(
      `[PosthogEventsProcessor] Found ${events.length} uningested events for user ${person_id}`,
    );

    try {
      // Create a summary of all events for this user
      const summary = await this.createLlmUserSummary(
        person_id,
        events,
        person_properties,
      );

      this.logger.debug(
        `[PosthogEventsProcessor] Generating embedding for user ${person_id}`,
      );

      const embedding = await this.embeddingsService.generateEmbedding(summary);

      // Create a unique ID for the user
      const userId = person_id;

      this.logger.debug(
        `[PosthogEventsProcessor] Upserting user ${userId} to Qdrant`,
      );

      try {
        await this.qdrantService.upsert('posthog_events', userId, embedding, {
          summary: summary,
          person_id: person_id,
          event_count: events.length,
          event_types: Array.from(new Set(events.map((e) => e.event))),
          vendor_ids: Array.from(
            new Set(events.map((e) => e.vendor_id).filter(Boolean)),
          ),
          time_span: this.formatTimeSpan(events),
          first_event: events[0]?.timestamp?.toISOString(),
          last_event: events[events.length - 1]?.timestamp?.toISOString(),
          // Store flattened data for better similarity search
          flattened_data: this.getFlattenedMetadata(events),
          person_properties: person_properties,
          // Store individual events for detailed analysis
          events: events.map((e) => ({
            event: e.event,
            properties: e.properties,
            timestamp: e.timestamp,
            uuid: e.uuid,
          })),
        });
      } catch (error) {
        this.logger.error(
          `[PosthogEventsProcessor] Error upserting user ${userId} to Qdrant: ${error}`,
          error,
        );
        await this.ingestionAttemptsService.markAsFailed(attemptId, {
          failure_reason: this.determineFailureReason(error),
          error_message: JSON.stringify(error),
          error_details: {
            user_id: person_id,
            events_processed: events.length,
            events_total: events.length,
            processing_time_ms: Date.now() - startTime,
          },
        });
      }

      // Mark all events as ingested
      for (const event of events) {
        await this.posthogEventsService.markAsIngested(event.uuid);
      }

      this.logger.log(
        `[PosthogEventsProcessor] Completed processing user ${person_id} with ${events.length} events`,
      );

      await this.ingestionAttemptsService.markAsSuccess(attemptId, {
        events_processed: events.length,
        processing_time_ms: Date.now() - startTime,
        metadata: {
          embedding_size: embedding.length,
          qdrant_collection: 'posthog_events',
          user_id: person_id,
        },
      });
    } catch (error) {
      // If we fail after marking some events as ingested, mark as partial
      const processedEvents = events.filter(
        (e) => e.ingested_at !== null,
      ).length;

      if (processedEvents > 0) {
        await this.ingestionAttemptsService.markAsPartial(attemptId, {
          events_processed: processedEvents,
          events_total: events.length,
          failure_reason: this.determineFailureReason(error),
          error_message:
            typeof error === 'object' && error !== null && 'message' in error
              ? (error as { message: string }).message
              : String(error),
          error_details: {
            user_id: person_id,
            events_processed: processedEvents,
            events_total: events.length,
            processing_time_ms: Date.now() - startTime,
          },
        });
      } else {
        throw error; // Re-throw to be handled by the main error handler
      }
    }
  }

  private async createLlmUserSummary(
    person_id: string,
    events: PosthogEvent[],
    person_properties: Record<string, any>,
  ): Promise<string> {
    if (events.length === 0) {
      return `User ${person_id}: No activity recorded`;
    }

    // Sort events by timestamp
    events.sort(
      (a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0),
    );

    // Prepare structured data for LLM
    const userData = this.prepareUserDataForLlm(
      person_id,
      events,
      person_properties,
    );

    const prompt = USER_SUMMARY_PROMPT({
      question: "Summarize the user's activity",
      person_id,
      userData,
    });

    try {
      const summary = await this.llmService.generateResponse({
        prompt,
        modelOverride: LLM_MODELS.SUMMARY,
        stream: false,
      });
      if (typeof summary !== 'string') {
        throw new Error('Expected string summary from LLM, got void');
      }
      return summary;
    } catch (error) {
      this.logger.warn(
        `[PosthogEventsProcessor] LLM summary generation failed for user ${person_id}, falling back to text summary: ${error}`,
      );
      // Fallback to the original text-based summary
      return this.createTextUserSummary(person_id, events);
    }
  }

  private prepareUserDataForLlm(
    person_id: string,
    events: PosthogEvent[],
    person_properties: Record<string, any>,
  ): string {
    // Extract key information from events
    const eventTypes = new Set<string>();
    const deviceInfo = new Set<string>();
    const locationInfo = new Set<string>();
    const cartInfo = new Set<string>();
    const appInfo = new Set<string>();
    const timeline: string[] = [];
    const userInfo = new Set<string>();
    for (const event of events) {
      eventTypes.add(event.event);

      if (event.timestamp) {
        timeline.push(`${event.timestamp.toISOString()}: ${event.event}`);
      }

      // Extract properties
      const properties = event.properties || {};

      // User info
      if (person_properties['email'])
        userInfo.add(`Email: ${person_properties['email']}`);
      if (person_properties['user_name'])
        userInfo.add(`Name: ${person_properties['user_name']}`);

      // Device info
      if (properties['$device_name'])
        deviceInfo.add(`Device: ${properties['$device_name']}`);
      if (properties['$device_type'])
        deviceInfo.add(`Type: ${properties['$device_type']}`);
      if (properties['$os']) deviceInfo.add(`OS: ${properties['$os']}`);

      // Location info
      if (properties['$geoip_city_name'])
        locationInfo.add(`City: ${properties['$geoip_city_name']}`);
      if (properties['$geoip_country_name'])
        locationInfo.add(`Country: ${properties['$geoip_country_name']}`);

      // Cart info
      if (properties['cartTotal'])
        cartInfo.add(`Cart Total: ${properties['cartTotal']}`);
      if (properties['itemsCount'])
        cartInfo.add(`Items: ${properties['itemsCount']}`);
      if (properties['cartCurrency'])
        cartInfo.add(`Currency: ${properties['cartCurrency']}`);

      // App info
      if (properties['$app_name'])
        appInfo.add(`App: ${properties['$app_name']}`);
      if (properties['$app_version'])
        appInfo.add(`Version: ${properties['$app_version']}`);
    }

    return `
Total Events: ${events.length}
Event Types: ${Array.from(eventTypes).join(', ')}
Time Span: ${this.formatTimeSpan(events)}

Device Information:
${Array.from(deviceInfo).join('\n')}

Location Information:
${Array.from(locationInfo).join('\n')}

App Information:
${Array.from(appInfo).join('\n')}

Cart Activity:
${Array.from(cartInfo).join('\n')}

Recent Timeline (last 10 events):
${timeline.slice(-10).join('\n')}

User Information:
${Array.from(userInfo).join('\n')}

User Properties:
${JSON.stringify(person_properties)}
`;
  }

  private createTextUserSummary(
    person_id: string,
    events: PosthogEvent[],
  ): string {
    if (events.length === 0) {
      return `User ${person_id}: No activity recorded`;
    }

    // Sort events by timestamp
    events.sort(
      (a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0),
    );

    // Flatten all event data into a comprehensive user profile
    const userProfile = this.createFlattenedUserProfile(person_id, events);

    // Truncate if too long to avoid token limit errors
    return this.truncateForTokenLimit(userProfile);
  }

  private truncateForTokenLimit(summary: string): string {
    // Rough estimation: 1 token ≈ 4 characters for English text
    // Leave some buffer for safety (aim for ~7000 tokens max)
    const maxChars = 7000 * 4; // ~28,000 characters

    if (summary.length <= maxChars) {
      return summary;
    }

    // Truncate and add indicator
    const truncated = summary.substring(0, maxChars);
    return truncated + '\n\n[SUMMARY TRUNCATED - TOO MANY EVENTS]';
  }

  private createFlattenedUserProfile(
    person_id: string,
    events: PosthogEvent[],
  ): string {
    // Collect all unique data points across all events
    const allData = new Map<string, Set<string>>();
    const eventTypes = new Set<string>();
    const timestamps: string[] = [];
    const vendorIds = new Set<string>();
    const shopDomains = new Set<string>();

    // Process each event
    for (const event of events) {
      eventTypes.add(event.event);
      if (event.timestamp) {
        timestamps.push(event.timestamp.toISOString());
      }
      if (event.vendor_id) vendorIds.add(event.vendor_id);

      // Flatten event properties
      const properties = event.properties || {};

      this.flattenAndCollectData(properties, 'properties', allData);
    }

    // Build comprehensive user profile
    const profile = [
      `USER PROFILE: ${person_id}`,
      `=====================================`,
      '',
      `ACTIVITY SUMMARY:`,
      `- Total events: ${events.length}`,
      `- Event types: ${Array.from(eventTypes).join(', ')}`,
      `- Time span: ${this.formatTimeSpan(events)}`,
      `- Vendors: ${Array.from(vendorIds).join(', ') || 'None'}`,
      `- Shop domains: ${Array.from(shopDomains).join(', ') || 'None'}`,
      '',
      `TIMELINE:`,
      ...timestamps.map((ts, i) => `${i + 1}. ${ts}`),
      '',
      `COMPREHENSIVE DATA:`,
    ];

    // Add all collected data, organized by category
    const categories = this.categorizeData(allData);

    for (const [category, data] of Object.entries(categories)) {
      if (data.length > 0) {
        profile.push(`\n${category.toUpperCase()}:`);
        profile.push(...data.slice(0, 20).map((item) => `- ${item}`)); // Limit to 20 items per category
        if (data.length > 20) {
          profile.push(`- ... and ${data.length - 20} more items`);
        }
      }
    }

    return profile.join('\n');
  }

  private flattenAndCollectData(
    obj: Record<string, unknown>,
    prefix: string,
    allData: Map<string, Set<string>>,
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}_${key}` : key;

      if (value === null || value === undefined) {
        continue;
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        if (!allData.has(fullKey)) {
          allData.set(fullKey, new Set());
        }
        allData.get(fullKey).add(String(value));
      } else if (Array.isArray(value)) {
        if (value.length > 0) {
          const arrayStr = value.map((v) => String(v)).join(', ');
          if (!allData.has(fullKey)) {
            allData.set(fullKey, new Set());
          }
          allData.get(fullKey).add(arrayStr);
        }
      } else if (typeof value === 'object') {
        // Recursively flatten nested objects
        this.flattenAndCollectData(
          value as Record<string, unknown>,
          fullKey,
          allData,
        );
      }
    }
  }

  private categorizeData(
    allData: Map<string, Set<string>>,
  ): Record<string, string[]> {
    const categories: Record<string, string[]> = {
      user: [],
      device: [],
      location: [],
      app: [],
      screen: [],
      cart: [],
      session: [],
      vendor: [],
      technical: [],
      other: [],
    };

    for (const [key, values] of allData) {
      const valueList = Array.from(values);
      const summary = `${key}: ${valueList.join(' | ')}`;

      if (
        key.includes('name') ||
        key.includes('email') ||
        key.includes('person_id')
      ) {
        categories.user.push(summary);
      } else if (
        key.includes('device') ||
        key.includes('os') ||
        key.includes('manufacturer')
      ) {
        categories.device.push(summary);
      } else if (
        key.includes('geoip') ||
        key.includes('location') ||
        key.includes('city') ||
        key.includes('country')
      ) {
        categories.location.push(summary);
      } else if (key.includes('app_') || key.includes('$app')) {
        categories.app.push(summary);
      } else if (
        key.includes('screen') ||
        key.includes('width') ||
        key.includes('height')
      ) {
        categories.screen.push(summary);
      } else if (key.includes('cart')) {
        categories.cart.push(summary);
      } else if (key.includes('session') || key.includes('lib_version')) {
        categories.session.push(summary);
      } else if (key.includes('vendor') || key.includes('shop')) {
        categories.vendor.push(summary);
      } else if (
        key.includes('$') ||
        key.includes('uuid') ||
        key.includes('timestamp')
      ) {
        categories.technical.push(summary);
      } else {
        categories.other.push(summary);
      }
    }

    return categories;
  }

  private formatTimeSpan(events: PosthogEvent[]): string {
    if (events.length < 2) return 'Single event';

    const firstTime = events[0].timestamp;
    const lastTime = events[events.length - 1].timestamp;

    if (!firstTime || !lastTime) return 'Unknown time span';

    const duration = lastTime.getTime() - firstTime.getTime();
    return this.formatDuration(duration);
  }

  private formatTimestamp(date: Date): string {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private formatDuration(milliseconds: number): string {
    const minutes = Math.floor(milliseconds / (1000 * 60));
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    } else {
      return 'Less than a minute';
    }
  }

  private logError(message: string, error: any) {
    this.logger.error(message);
    this.logger.error(
      `[PosthogEventsProcessor] Error details: ${JSON.stringify(error)}`,
    );
    if (
      typeof error === 'object' &&
      error !== null &&
      'meta' in error &&
      typeof (error as { meta?: unknown }).meta === 'object' &&
      (error as { meta?: { body?: { error?: { reason?: string } } } }).meta
        ?.body?.error?.reason
    ) {
      const reason = (
        error as { meta: { body: { error: { reason: string } } } }
      ).meta.body.error.reason;
      console.error('[PosthogEventsProcessor] Qdrant error reason:', reason);
    }
  }

  private getFlattenedMetadata(
    events: PosthogEvent[],
  ): Record<string, string[]> {
    const metadata: Record<string, string[]> = {};

    for (const event of events) {
      const properties = event.properties || {};

      // Flatten properties
      this.flattenAndCollectMetadata(properties, 'properties', metadata);

      // Note: elements property doesn't exist on PosthogEvent, so we skip it
    }

    return metadata;
  }

  private flattenAndCollectMetadata(
    obj: Record<string, unknown>,
    prefix: string,
    metadata: Record<string, string[]>,
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}_${key}` : key;

      if (value === null || value === undefined) {
        continue;
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        if (!metadata[fullKey]) {
          metadata[fullKey] = [];
        }
        metadata[fullKey].push(String(value));
      } else if (Array.isArray(value)) {
        if (value.length > 0) {
          const arrayStr = value.map((v) => String(v)).join(', ');
          if (!metadata[fullKey]) {
            metadata[fullKey] = [];
          }
          metadata[fullKey].push(arrayStr);
        }
      } else if (typeof value === 'object') {
        // Recursively flatten nested objects
        this.flattenAndCollectMetadata(
          value as Record<string, unknown>,
          fullKey,
          metadata,
        );
      }
    }
  }
}
