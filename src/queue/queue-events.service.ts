import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, QUEUE_PROCESSORS } from './const';

@Injectable()
export class QueueEventsService {
  constructor(
    @InjectQueue(QUEUE_NAMES.EVENT_SYNC) private readonly eventSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.POSTHOG_EVENTS)
    private readonly posthogEventsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.UI_BLOCKS_EMBEDDING)
    private readonly uiBlocksEmbeddingQueue: Queue,
  ) {}

  async queueSyncJob({
    batchSize,
  }: {
    batchSize: number;
  }): Promise<{ status: string; batchSize: number }> {
    await this.eventSyncQueue.add(QUEUE_PROCESSORS.EVENT_SYNC.SYNC_EVENTS, {
      batchSize,
    });
    return { status: 'queued', batchSize };
  }

  async queuePosthogIngestJob({
    batchSize,
  }: {
    batchSize: number;
  }): Promise<{ status: string; batchSize: number }> {
    await this.posthogEventsQueue.add(
      QUEUE_PROCESSORS.POSTHOG_EVENTS.FIND_USERS,
      { batchSize },
    );
    return { status: 'queued', batchSize };
  }

  async queueFindUsersJob({
    batchSize,
  }: {
    batchSize: number;
  }): Promise<{ status: string; batchSize: number }> {
    await this.posthogEventsQueue.add(
      QUEUE_PROCESSORS.POSTHOG_EVENTS.FIND_USERS,
      { batchSize },
    );
    return { status: 'queued', batchSize };
  }

  async queueProcessUserJob({
    person_id,
  }: {
    person_id: string;
  }): Promise<{ status: string; person_id: string }> {
    await this.posthogEventsQueue.add(
      QUEUE_PROCESSORS.POSTHOG_EVENTS.PROCESS_USER,
      { person_id },
    );
    return { status: 'queued', person_id };
  }

  async queueFindUniqueUsersJob({
    batchSize,
  }: {
    batchSize: number;
  }): Promise<{ status: string; batchSize: number }> {
    await this.posthogEventsQueue.add(
      QUEUE_PROCESSORS.POSTHOG_EVENTS.FIND_UNIQUE_USERS,
      { batchSize },
    );
    return { status: 'queued', batchSize };
  }

  async queueUiBlocksEmbeddingJob({
    filter,
    batchSize,
  }: {
    filter?: Record<string, unknown>;
    batchSize?: number;
  }): Promise<{
    status: string;
    filter?: Record<string, unknown>;
    batchSize?: number;
  }> {
    await this.uiBlocksEmbeddingQueue.add(
      QUEUE_PROCESSORS.UI_BLOCKS_EMBEDDING.PROCESS_BLOCKS,
      { filter, batchSize },
    );
    return { status: 'queued', filter, batchSize };
  }
}
