import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './entities/event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
  ) {}

  async create(createEventDto: {
    user_id: string;
    event_type: string;
    event_data: Record<string, any>;
  }): Promise<Event> {
    const event = this.eventRepository.create(createEventDto);
    return this.eventRepository.save(event);
  }

  async findAll(): Promise<Event[]> {
    return this.eventRepository.find();
  }

  async findUningestedEvents(): Promise<Event[]> {
    return this.eventRepository
      .createQueryBuilder('event')
      .where(
        'event.ingested_at IS NULL OR event.ingested_at < event.event_timestamp',
      )
      .getMany();
  }

  async findOne(id: number): Promise<Event> {
    const event = await this.eventRepository.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException(`Event with ID ${id} not found`);
    }
    return event;
  }

  async findByUserId(userId: string): Promise<Event[]> {
    return this.eventRepository.find({
      where: { user_id: userId },
      order: { event_timestamp: 'DESC' },
    });
  }

  async findByEventType(eventType: string): Promise<Event[]> {
    return this.eventRepository.find({
      where: { event_type: eventType },
      order: { event_timestamp: 'DESC' },
    });
  }

  async updateEmbedding(id: number, embedding: number[]): Promise<Event> {
    await this.eventRepository.update(id, { embedding });
    return this.findOne(id);
  }

  async updateIngestedAt(id: number, timestamp: Date): Promise<Event> {
    await this.eventRepository.update(id, { ingested_at: timestamp });
    return this.findOne(id);
  }

  async findSimilarEvents(
    embedding: number[],
    limit: number = 5,
  ): Promise<Event[]> {
    // Using L2 distance (Euclidean) for similarity
    return this.eventRepository
      .createQueryBuilder('event')
      .where('event.embedding IS NOT NULL')
      .orderBy(`event.embedding <-> :embedding::vector`, 'ASC')
      .setParameter('embedding', `[${embedding.join(',')}]`)
      .limit(limit)
      .getMany();
  }

  async findByTimeRange(
    startTime: Date,
    endTime: Date,
    eventType?: string,
  ): Promise<Event[]> {
    const query = this.eventRepository
      .createQueryBuilder('event')
      .where('event.event_timestamp BETWEEN :startTime AND :endTime', {
        startTime,
        endTime,
      });

    if (eventType) {
      query.andWhere('event.event_type = :eventType', { eventType });
    }

    return query.getMany();
  }

  async getIngestionStatus(): Promise<{
    totalEvents: number;
    pendingIngestion: number;
    lastIngestedAt: Date | null;
  }> {
    const [totalEvents, pendingEvents, lastIngestedEvent] = await Promise.all([
      this.eventRepository.count(),
      this.eventRepository
        .createQueryBuilder('event')
        .where(
          'event.ingested_at IS NULL OR event.ingested_at < event.event_timestamp',
        )
        .getCount(),
      this.eventRepository
        .createQueryBuilder('event')
        .where('event.ingested_at IS NOT NULL')
        .orderBy('event.ingested_at', 'DESC')
        .getOne(),
    ]);

    return {
      totalEvents,
      pendingIngestion: pendingEvents,
      lastIngestedAt: lastIngestedEvent?.ingested_at || null,
    };
  }
}
