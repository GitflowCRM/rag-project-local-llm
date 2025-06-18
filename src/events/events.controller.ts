import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { Event } from './entities/event.entity';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

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
}
