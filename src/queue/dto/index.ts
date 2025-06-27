import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsObject,
  IsString,
} from 'class-validator';

export interface CmsBlock {
  id: string;
  description?: string;
  block_id?: string;
  updated_at?: string;
}

export interface QdrantSearchResponse {
  result?: Array<{
    payload?: Record<string, unknown>;
  }>;
  total?: number;
}

export class UiBlocksIngestionDto {
  @ApiProperty({
    description: 'Number of UI blocks to process in each batch',
    example: 50,
    minimum: 1,
    maximum: 1000,
    required: false,
    default: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  batchSize?: number;

  @ApiProperty({
    description: 'Filter to apply when fetching UI blocks from CMS',
    example: { status: 'active', block_type: 'product' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  filter?: Record<string, unknown>;

  @ApiProperty({
    description:
      'Specific block ID to process (if provided, only this block will be processed)',
    example: 'hero-banner-001',
    required: false,
  })
  @IsOptional()
  @IsString()
  blockId?: string;
}

export class UiBlocksIngestionResponseDto {
  @ApiProperty({
    description: 'Status of the ingestion job',
    example: 'queued',
  })
  status: string;

  @ApiProperty({
    description: 'Job ID for tracking',
    example: 'job-123',
  })
  jobId?: string;

  @ApiProperty({
    description: 'Number of blocks to be processed',
    example: 25,
  })
  blocksToProcess?: number;

  @ApiProperty({
    description: 'Batch size used for the job',
    example: 50,
  })
  batchSize?: number;

  @ApiProperty({
    description: 'Filter applied to the job',
    example: { status: 'active' },
  })
  filter?: Record<string, unknown>;
}

export class UiBlocksStatusDto {
  @ApiProperty({
    description: 'Total number of UI blocks in CMS',
    example: 150,
  })
  totalBlocks: number;

  @ApiProperty({
    description: 'Number of blocks already embedded in Qdrant',
    example: 125,
  })
  embeddedBlocks: number;

  @ApiProperty({
    description: 'Number of blocks pending embedding',
    example: 25,
  })
  pendingBlocks: number;

  @ApiProperty({
    description: 'Percentage of blocks embedded',
    example: 83.33,
  })
  completionPercentage: number;
}

export class BlockDetailDto {
  @ApiProperty({
    description: 'Block ID',
    example: 'hero-banner-001',
  })
  blockId: string;

  @ApiProperty({
    description: 'Block description',
    example: 'Hero banner with call-to-action',
  })
  description: string;

  @ApiProperty({
    description: 'Whether the block is embedded in Qdrant',
    example: true,
  })
  isEmbedded: boolean;

  @ApiProperty({
    description: 'Embedding summary if available',
    example: 'Hero banner component for homepage',
  })
  summary?: string;

  @ApiProperty({
    description: 'Last updated timestamp',
    example: '2024-01-15T10:30:00Z',
  })
  lastUpdated?: string;
}
