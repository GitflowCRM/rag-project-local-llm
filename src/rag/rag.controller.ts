import { Controller, Post, Body } from '@nestjs/common';
import { RagService } from './rag.service';

class QueryDto {
  question: string;
  filters?: {
    eventType?: string;
  };
}

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('query')
  async query(@Body() queryDto: QueryDto): Promise<{ answer: string }> {
    const answer = await this.ragService.processQuery(
      queryDto.question,
      queryDto.filters,
    );
    return { answer };
  }
}
