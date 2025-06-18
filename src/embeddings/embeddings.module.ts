import { Module } from '@nestjs/common';
import { EmbeddingsService } from './embeddings.service';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [EventsModule],
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
