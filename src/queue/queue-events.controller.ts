import { Controller, Post, Body } from '@nestjs/common';
import { QueueEventsService } from './queue-events.service';

@Controller()
export class QueueEventsController {
  constructor(private readonly queueEventsService: QueueEventsService) {}

  @Post('queue-sync-job')
  async queueSyncJob(
    @Body() body: { batchSize: number },
  ): Promise<{ status: string; batchSize: number }> {
    if (!body.batchSize) {
      body.batchSize = 100;
    }
    return await this.queueEventsService.queueSyncJob(body);
  }
}
