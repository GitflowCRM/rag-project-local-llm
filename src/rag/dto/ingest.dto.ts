import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class IngestDto {
  @ApiProperty({
    description: 'Time window in hours to filter events',
    required: false,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  timeWindowHours?: number;

  @ApiProperty({
    description: 'User ID to filter events',
    required: false,
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({
    description: 'Category to filter events',
    required: false,
  })
  @IsOptional()
  @IsString()
  category?: string;
}
