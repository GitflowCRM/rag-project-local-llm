import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { EventsService } from '../events/events.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { QUEUE_NAMES, QUEUE_PROCESSORS } from './const';

interface SyncJobData {
  batchSize: number;
}

@Processor(QUEUE_NAMES.EVENT_SYNC)
export class EventsSyncProcessor {
  constructor(
    private readonly eventsService: EventsService,
    private readonly qdrantService: QdrantService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  @Process(QUEUE_PROCESSORS.EVENT_SYNC.SYNC_EVENTS)
  async handleSyncJob(job: Job<SyncJobData>) {
    const { batchSize } = job.data;
    // Fetch events in batches (not yet ingested)
    const events = await this.eventsService.findUningestedEvents(batchSize);
    for (const event of events) {
      // Generate embedding and upsert to Qdrant
      // TODO - generate summary of event data
      const embedding = await this.embeddingsService.generateEmbedding(
        JSON.stringify(event.event_data),
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
      // Mark as ingested
      await this.eventsService.markAsIngested(event.id);
    }
    return { processed: events.length };
  }
}
