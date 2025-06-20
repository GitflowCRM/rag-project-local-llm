import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QdrantService } from './qdrant.service';
import { QdrantController } from './qdrant.controller';
import { Event } from '../events/entities/event.entity';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([Event]),
    EmbeddingsModule,
    forwardRef(() => LlmModule),
  ],
  controllers: [QdrantController],
  providers: [QdrantService],
  exports: [QdrantService],
})
export class QdrantModule {}
