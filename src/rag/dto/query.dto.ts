import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';

export class QueryDto {
  @ApiProperty({
    description: 'The natural language question to query the RAG system',
    example: 'How many users placed an order in the last 24 hours?',
  })
  @IsString()
  question: string;

  @ApiProperty({
    description: 'Optional filters to apply to the query',
    example: { eventType: 'purchase' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;
}
