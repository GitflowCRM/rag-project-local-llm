import { Module, forwardRef } from '@nestjs/common';
import { QueueEventsService } from './queue-events.service';
import { EventsSyncProcessor } from './events-sync.processor';
import { PosthogEventsProcessor } from './posthog-events.processor';
import { EventsModule } from '../events/events.module';
import { QdrantModule } from '../qdrant/qdrant.module';
import { QueueEventsController } from './queue-events.controller';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { LlmModule } from '../llm/llm.module';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './const';

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
    ),
    EventsModule,
    QdrantModule,
    EmbeddingsModule,
    forwardRef(() => LlmModule),
  ],
  controllers: [QueueEventsController],
  providers: [QueueEventsService, EventsSyncProcessor, PosthogEventsProcessor],
  exports: [BullModule, QueueEventsService],
})
export class QueueModule {}
