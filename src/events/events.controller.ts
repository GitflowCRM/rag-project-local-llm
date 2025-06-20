import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { PosthogEventsService } from './posthog-events.service';
import { IngestionAttemptsService } from './ingestion-attempts.service';
import { Event } from './entities/event.entity';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly posthogEventsService: PosthogEventsService,
    private readonly ingestionAttemptsService: IngestionAttemptsService,
  ) {}

  @Post()
  create(
    @Body()
    createEventDto: {
      user_id: string;
      event_type: string;
      event_data: Record<string, any>;
    },
  ): Promise<Event> {
    return this.eventsService.create(createEventDto);
  }

  @Get()
  findAll(): Promise<Event[]> {
    return this.eventsService.findAll();
  }

  @Get('ingestion-status')
  @ApiOperation({ summary: 'Get ingestion status summary' })
  @ApiResponse({
    status: 200,
    description: 'Returns summary of events ingestion status',
    schema: {
      type: 'object',
      properties: {
        totalEvents: { type: 'number', description: 'Total number of events' },
        pendingIngestion: {
          type: 'number',
          description: 'Number of events pending ingestion',
        },
        lastIngestedAt: {
          type: 'string',
          format: 'date-time',
          description: 'Timestamp of last ingestion, or null if none',
        },
      },
    },
  })
  getIngestionStatus() {
    return this.eventsService.getIngestionStatus();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Event> {
    return this.eventsService.findOne(+id);
  }

  @Get('user/:userId')
  findByUserId(@Param('userId') userId: string): Promise<Event[]> {
    return this.eventsService.findByUserId(userId);
  }

  @Get('type/:eventType')
  findByEventType(@Param('eventType') eventType: string): Promise<Event[]> {
    return this.eventsService.findByEventType(eventType);
  }

  @Get('time-range')
  findByTimeRange(
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('eventType') eventType?: string,
  ): Promise<Event[]> {
    return this.eventsService.findByTimeRange(
      new Date(startTime),
      new Date(endTime),
      eventType,
    );
  }

  @Get('posthog/ingested-users/count')
  @ApiOperation({ summary: 'Get count of unique users with ingested events' })
  @ApiResponse({
    status: 200,
    description: 'Returns count of unique users with ingested events',
    schema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of unique users with ingested events',
        },
      },
    },
  })
  async getIngestedUserCount() {
    const count = await this.posthogEventsService.countIngestedUsers();
    return { count };
  }

  @Get('posthog/uningested-users/count')
  @ApiOperation({ summary: 'Get count of unique users with uningested events' })
  @ApiResponse({
    status: 200,
    description: 'Returns count of unique users with uningested events',
    schema: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of unique users with uningested events',
        },
      },
    },
  })
  async getUningestedUserCount() {
    const count = await this.posthogEventsService.countUningestedUsers();
    return { count };
  }

  @Get('posthog/user-stats')
  @ApiOperation({
    summary: 'Get comprehensive Posthog user ingestion statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns comprehensive user and event ingestion statistics',
    schema: {
      type: 'object',
      properties: {
        totalUsers: { type: 'number', description: 'Total unique users' },
        ingestedUsers: {
          type: 'number',
          description: 'Users with ingested events',
        },
        uningestedUsers: {
          type: 'number',
          description: 'Users with uningested events',
        },
        totalEvents: { type: 'number', description: 'Total events' },
        ingestedEvents: { type: 'number', description: 'Ingested events' },
        uningestedEvents: { type: 'number', description: 'Uningested events' },
      },
    },
  })
  async getPosthogUserStats() {
    return await this.posthogEventsService.getUserIngestionStats();
  }

  @Get('posthog/ingestion-attempts/stats')
  @ApiOperation({ summary: 'Get ingestion attempts statistics' })
  @ApiResponse({
    status: 200,
    description: 'Returns comprehensive ingestion attempts statistics',
  })
  async getIngestionAttemptsStats() {
    return await this.ingestionAttemptsService.getStats();
  }

  @Get('posthog/ingestion-attempts/failed')
  @ApiOperation({ summary: 'Get failed ingestion attempts' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of failed ingestion attempts',
  })
  async getFailedIngestionAttempts(@Query('limit') limit = '50') {
    return await this.ingestionAttemptsService.getFailedAttempts(Number(limit));
  }

  @Get('posthog/ingestion-attempts/recent')
  @ApiOperation({ summary: 'Get recent ingestion attempts' })
  @ApiResponse({
    status: 200,
    description: 'Returns list of recent ingestion attempts',
  })
  async getRecentIngestionAttempts(@Query('limit') limit = '20') {
    return await this.ingestionAttemptsService.getRecentAttempts(Number(limit));
  }

  @Get('posthog/ingestion-attempts/user/:personId/failed')
  @ApiOperation({
    summary: 'Get failed ingestion attempts for a specific user',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns list of failed ingestion attempts for the user',
  })
  async getFailedIngestionAttemptsForUser(@Param('personId') personId: string) {
    return await this.ingestionAttemptsService.getFailedAttemptsByPersonId(
      personId,
    );
  }
}
