import { Module, forwardRef } from '@nestjs/common';
import { QueueEventsService } from './queue-events.service';
import { EventsSyncProcessor } from './events-sync.processor';
import { PosthogEventsProcessor } from './posthog-events.processor';
import { UiBlocksEmbeddingProcessor } from './ui-blocks-embedding.processor';
import { EventsModule } from '../events/events.module';
import { QdrantModule } from '../qdrant/qdrant.module';
import { QueueEventsController } from './queue-events.controller';
import { UiBlocksController } from './ui-blocks.controller';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { LlmModule } from '../llm/llm.module';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './const';
import { CMSService } from '../cms.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EVENT_SYNC },
      { name: QUEUE_NAMES.EMBEDDINGS },
      { name: QUEUE_NAMES.POSTHOG_EVENTS },
      { name: QUEUE_NAMES.UI_BLOCKS_EMBEDDING },
    ),
    EventsModule,
    QdrantModule,
    EmbeddingsModule,
    forwardRef(() => LlmModule),
  ],
  controllers: [QueueEventsController, UiBlocksController],
  providers: [
    QueueEventsService,
    EventsSyncProcessor,
    PosthogEventsProcessor,
    CMSService,
    UiBlocksEmbeddingProcessor,
  ],
  exports: [BullModule, QueueEventsService],
})
export class QueueModule {}
