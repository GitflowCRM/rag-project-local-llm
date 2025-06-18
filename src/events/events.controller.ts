import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { EventsService } from './events.service';
import { Event } from './entities/event.entity';

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
    return this.eventsService.findEventsByTimeRange(
      new Date(startTime),
      new Date(endTime),
      eventType,
    );
  }
}
