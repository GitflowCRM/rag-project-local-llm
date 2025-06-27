import { Module } from '@nestjs/common';
import { UiGenerationController } from './ui-generation.controller';
import { UiGenerationService } from './ui-generation.service';
import { QdrantModule } from '../qdrant/qdrant.module';
import { LlmModule } from '../llm/llm.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [QdrantModule, LlmModule, EmbeddingsModule],
  controllers: [UiGenerationController],
  providers: [UiGenerationService],
  exports: [UiGenerationService],
})
export class UiGenerationModule {}
