import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { EventsModule } from '../events/events.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [EventsModule, EmbeddingsModule, LlmModule],
  controllers: [RagController],
  providers: [RagService],
})
export class RagModule {}
