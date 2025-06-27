import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, Max, IsObject } from 'class-validator';
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

export class UiBlocksEmbeddingJobDto {
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

  @ApiProperty({
    description: 'Filter to apply when fetching UI blocks',
    example: { status: 'active' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  filter?: Record<string, unknown>;
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

export class UiBlocksEmbeddingJobResponseDto {
  @ApiProperty({
    description: 'Status of the queued job',
    example: 'queued',
  })
  status: string;

  @ApiProperty({
    description: 'Batch size used for the job',
    example: 100,
  })
  batchSize?: number;

  @ApiProperty({
    description: 'Filter applied to the job',
    example: { status: 'active' },
  })
  filter?: Record<string, unknown>;
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
  async queueSyncJob(@Body() body: QueueJobDto): Promise<QueueJobResponseDto> {
    if (!body.batchSize) {
      body.batchSize = 100;
    }
    return await this.queueEventsService.queueSyncJob({
      batchSize: body.batchSize,
    });
  }

  @Post('queue-posthog-ingest-job')
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
