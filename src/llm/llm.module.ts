import { Logger, Module, forwardRef } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmController } from './llm.controller';
import { QdrantModule } from '../qdrant/qdrant.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [forwardRef(() => QdrantModule), EmbeddingsModule],
  controllers: [LlmController],
  providers: [LlmService, Logger],
  exports: [LlmService],
})
export class LlmModule {}
