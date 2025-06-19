import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EventsService } from '../events/events.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { QUEUE_NAMES } from './const';
import { Logger } from '@nestjs/common';

interface SyncJobData {
  batchSize: number;
}

@Processor(QUEUE_NAMES.POSTHOG_EVENTS, { concurrency: 1 })
export class PosthogEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(PosthogEventsProcessor.name);
  constructor(
    private readonly eventsService: EventsService,
    private readonly qdrantService: QdrantService,
    private readonly embeddingsService: EmbeddingsService,
  ) {
    super();
    this.logger.log(
      `BullMQ Processor initialized for queue: ${QUEUE_NAMES.POSTHOG_EVENTS}`,
    );
  }

  async process(job: Job<SyncJobData>): Promise<void> {
    this.logger.log(
      `[PosthogEventsProcessor] Starting job ${job.id} of type ${job.name} with data: ${JSON.stringify(job.data)}`,
    );
    try {
      switch (job.name) {
        case 'SYNC_EVENTS':
          await this.handleSyncEvents(job.data);
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
      this.logError(
        `[PosthogEventsProcessor] Error processing job ${job.id}: ` +
          (typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message
            : String(error)),
        error,
      );
    }
  }

  private async handleSyncEvents(data: SyncJobData) {
    const { batchSize } = data;
    this.logger.debug(
      `[PosthogEventsProcessor] Fetching up to ${batchSize} uningested events`,
    );
    const events = await this.eventsService.findUningestedEvents(batchSize);
    let processed = 0;
    for (const event of events) {
      try {
        this.logger.debug(
          `[PosthogEventsProcessor] Generating embedding for event ID: ${event.id}`,
        );
        const embedding = await this.embeddingsService.generateEmbedding(
          JSON.stringify(event.event_data),
        );
        this.logger.debug(
          `[PosthogEventsProcessor] Upserting event ID: ${event.id} to Qdrant`,
        );
        await this.qdrantService.upsert(
          'events',
          event.id.toString(),
          embedding,
          {
            user_id: event.user_id,
            event_type: event.event_type,
            event_data: event.event_data,
            event_timestamp: event.event_timestamp,
          },
        );
        this.logger.debug(
          `[PosthogEventsProcessor] Marking event ID: ${event.id} as ingested`,
        );
        await this.eventsService.markAsIngested(event.id);
        processed++;
      } catch (error) {
        this.logError(
          `[PosthogEventsProcessor] Failed to process event ID: ${event.id}`,
          error,
        );
      }
    }
    this.logger.log(
      `[PosthogEventsProcessor] Processed ${processed} events in this batch`,
    );
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
}
