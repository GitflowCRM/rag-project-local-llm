import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { Event } from './entities/event.entity';
import { PosthogEventsService } from './posthog-events.service';
import { PosthogEvent } from './entities/posthog-event.entity';
import { IngestionAttemptsService } from './ingestion-attempts.service';
import { IngestionAttempt } from './entities/ingestion-attempt.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Event, PosthogEvent, IngestionAttempt])],
  controllers: [EventsController],
  providers: [EventsService, PosthogEventsService, IngestionAttemptsService],
  exports: [EventsService, PosthogEventsService, IngestionAttemptsService],
})
export class EventsModule {}
