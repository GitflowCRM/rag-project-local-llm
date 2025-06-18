import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber } from 'class-validator';

export class IngestDto {
  @ApiProperty({
    description: 'Optional time window in hours to ingest events from',
    example: 24,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  timeWindowHours?: number;

  @ApiProperty({
    description: 'Optional user ID to filter events for ingestion',
    example: 'user123',
    required: false,
  })
  @IsOptional()
  @IsString()
  userId?: string;
}
