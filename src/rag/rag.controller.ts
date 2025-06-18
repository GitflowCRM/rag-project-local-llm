import { Controller, Post, Body } from '@nestjs/common';
import { RagService } from './rag.service';
import { QueryDto } from './dto/query.dto';

@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('query')
  async query(@Body() queryDto: QueryDto): Promise<{ answer: string }> {
    // Only use question for now, as filters are not implemented in the service
    return this.ragService.query(queryDto.question);
  }

  @Post('ingest')
  async ingest() {
    return this.ragService.ingest();
  }
}
