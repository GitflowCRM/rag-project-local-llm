import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { QueueEventsService } from './queue-events.service';

class QueueJobDto {
  @ApiProperty({
    description: 'Number of items to process in each batch',
    example: 100,
    minimum: 1,
    maximum: 1000,
    required: false,
    default: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  batchSize?: number;
}

class QueueJobResponseDto {
  @ApiProperty({
    description: 'Status of the queued job',
    example: 'queued',
  })
  status: string;

  @ApiProperty({
    description: 'Batch size used for the job',
    example: 100,
  })
  batchSize: number;
}

@ApiTags('Queue Events')
@Controller()
export class QueueEventsController {
  constructor(private readonly queueEventsService: QueueEventsService) {}

  @Post('queue-sync-job')
  @ApiOperation({
    summary: 'Queue a sync job for processing events',
    description:
      'Adds a job to the event sync queue to process unprocessed events in batches',
  })
  @ApiBody({
    type: QueueJobDto,
    description: 'Job configuration with batch size',
  })
  @ApiResponse({
    status: 200,
    description: 'Job successfully queued',
    type: QueueJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid batch size provided',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error while queuing job',
  })
  async queueSyncJob(@Body() body: QueueJobDto): Promise<QueueJobResponseDto> {
    if (!body.batchSize) {
      body.batchSize = 100;
    }
    return await this.queueEventsService.queueSyncJob({
      batchSize: body.batchSize,
    });
  }

  @Post('queue-posthog-ingest-job')
  @ApiOperation({
    summary: 'Queue a PostHog events ingestion job',
    description:
      'Adds a job to the PostHog events queue to process and ingest PostHog events into the vector database',
  })
  @ApiBody({
    type: QueueJobDto,
    description:
      'Job configuration with batch size (defaults to 3 for PostHog events)',
  })
  @ApiResponse({
    status: 200,
    description: 'PostHog ingestion job successfully queued',
    type: QueueJobResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid batch size provided',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error while queuing job',
  })
  async queuePosthogIngestJob(
    @Body() body: QueueJobDto,
  ): Promise<QueueJobResponseDto> {
    if (!body?.batchSize) {
      body.batchSize = 3;
    }
    return await this.queueEventsService.queuePosthogIngestJob({
      batchSize: body.batchSize,
    });
  }
}
