import { Logger, Module, forwardRef } from '@nestjs/common';
import { LlmService } from './llm.service';
import { LlmController } from './llm.controller';
import { QdrantModule } from '../qdrant/qdrant.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    forwardRef(() => QdrantModule),
    EmbeddingsModule,
    forwardRef(() => QueueModule),
  ],
  controllers: [LlmController],
  providers: [LlmService, Logger],
  exports: [LlmService],
})
export class LlmModule {}
