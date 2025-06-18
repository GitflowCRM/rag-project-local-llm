import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './entities/event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
  ) {}

  async create(createEventDto: {
    user_id: string;
    event_type: string;
    event_data: Record<string, any>;
  }): Promise<Event> {
    const event = this.eventsRepository.create(createEventDto);
    return this.eventsRepository.save(event);
  }

  async findAll(): Promise<Event[]> {
    return this.eventsRepository.find();
  }

  async findOne(id: number): Promise<Event> {
    const event = await this.eventsRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }
    return event;
  }

  async findByUserId(userId: string): Promise<Event[]> {
    return this.eventsRepository.find({
      where: { user_id: userId },
      order: { event_timestamp: 'DESC' },
    });
  }

  async findByEventType(eventType: string): Promise<Event[]> {
    return this.eventsRepository.find({
      where: { event_type: eventType },
      order: { event_timestamp: 'DESC' },
    });
  }

  async updateEmbedding(id: number, embedding: number[]): Promise<Event> {
    const event = await this.findOne(id);
    await this.eventsRepository.update(id, { embedding });
    return this.findOne(id);
  }

  async findSimilarEvents(embedding: number[], limit: number = 5): Promise<Event[]> {
    // Using raw query for vector similarity search
    return this.eventsRepository
      .createQueryBuilder('event')
      .where('event.embedding IS NOT NULL')
      .orderBy('event.embedding <=> :embedding', 'ASC')
      .setParameter('embedding', embedding)
      .limit(limit)
      .getMany();
  }

  async findEventsByTimeRange(
    startTime: Date,
    endTime: Date,
    eventType?: string,
  ): Promise<Event[]> {
    const query = this.eventsRepository
      .createQueryBuilder('event')
      .where('event.event_timestamp BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      });

    if (eventType) {
      query.andWhere('event.event_type = :eventType', { eventType });
    }

    return query.orderBy('event.event_timestamp', 'DESC').getMany();
  }
}
