import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bullmq';

@Injectable()
export class QueueEventsService {
  constructor(
    @InjectQueue('event-sync') private readonly eventSyncQueue: Queue,
  ) {}

  async queueSyncJob({
    batchSize,
  }: {
    batchSize: number;
  }): Promise<{ status: string; batchSize: number }> {
    await this.eventSyncQueue.add('sync', { batchSize });
    return { status: 'queued', batchSize };
  }
}
