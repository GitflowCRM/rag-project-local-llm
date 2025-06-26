import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { PosthogEvent } from './entities/posthog-event.entity';
import { Logger } from '@nestjs/common';

@Injectable()
export class PosthogEventsService {
  private readonly logger = new Logger(PosthogEventsService.name);
  constructor(
    @InjectRepository(PosthogEvent)
    private readonly posthogEventRepository: Repository<PosthogEvent>,
  ) {}

  async findUningestedEvents(batchSize?: number): Promise<PosthogEvent[]> {
    const query = this.posthogEventRepository
      .createQueryBuilder('event')
      .where('event.ingested_at IS NULL');
    if (batchSize) query.take(batchSize);
    return query.getMany();
  }

  async markAsIngested(uuid: string) {
    await this.posthogEventRepository.update(uuid, { ingested_at: new Date() });
  }

  // Summarize a single event to a human-readable string
  public summarizeEvent(event: PosthogEvent): string {
    const properties = event.properties || {};

    // Flatten all properties into a comprehensive summary
    const flattenedProps = this.flattenObject(properties, 'properties');

    // Combine all data
    const allData = {
      event_type: event.event,
      timestamp: event.timestamp?.toISOString(),
      uuid: event.uuid,
      person_id: event.person_id,
      vendor_id: event.vendor_id,
      ...flattenedProps,
    };

    // Convert to a structured summary
    return this.createStructuredSummary(allData);
  }

  private flattenObject(
    obj: Record<string, unknown>,
    prefix: string = '',
  ): Record<string, string> {
    const flattened: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}_${key}` : key;

      if (value === null || value === undefined) {
        continue; // Skip null/undefined values
      } else if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        flattened[fullKey] = String(value);
      } else if (Array.isArray(value)) {
        if (value.length > 0) {
          // For arrays, join with commas and limit length
          const arrayStr = value.map((v) => String(v)).join(', ');
          flattened[fullKey] =
            arrayStr.length > 200
              ? arrayStr.substring(0, 200) + '...'
              : arrayStr;
        }
      } else if (typeof value === 'object') {
        // Recursively flatten nested objects
        const nested = this.flattenObject(
          value as Record<string, unknown>,
          fullKey,
        );
        Object.assign(flattened, nested);
      }
    }

    return flattened;
  }

  private createStructuredSummary(data: Record<string, string>): string {
    // Group related fields together
    const groups = {
      event: ['event_type', 'timestamp', 'uuid', 'person_id'],
      vendor: ['vendor_id'],
      device: [
        'properties_$device_name',
        'properties_$device_type',
        'properties_$os',
        'properties_$os_version',
        'properties_$device_manufacturer',
      ],
      location: [
        'properties_$geoip_city_name',
        'properties_$geoip_country_name',
        'properties_$geoip_subdivision_1_name',
        'properties_$geoip_time_zone',
        'properties_$geoip_latitude',
        'properties_$geoip_longitude',
      ],
      app: [
        'properties_$app_name',
        'properties_$app_version',
        'properties_$app_build',
        'properties_$app_namespace',
      ],
      screen: [
        'properties_$screen_name',
        'properties_$screen_width',
        'properties_$screen_height',
      ],
      cart: [
        'properties_cart_cartTotal',
        'properties_cart_itemsCount',
        'properties_cart_cartCurrency',
        'properties_cart_cartLink',
      ],
      user: ['properties_name', 'properties_email', 'properties_emailVerified'],
      session: ['properties_$session_id', 'properties_$lib_version'],
      other: [] as string[],
    };

    // Categorize all fields
    const categorized: Record<string, string[]> = {};
    const usedFields = new Set<string>();

    for (const [groupName, groupFields] of Object.entries(groups)) {
      categorized[groupName] = [];
      for (const field of groupFields) {
        if (data[field] && !usedFields.has(field)) {
          categorized[groupName].push(`${field}: ${data[field]}`);
          usedFields.add(field);
        }
      }
    }

    // Add remaining fields to 'other'
    for (const [key, value] of Object.entries(data)) {
      if (!usedFields.has(key)) {
        categorized.other.push(`${key}: ${value}`);
      }
    }

    // Build the summary
    const parts: string[] = [];

    // Event info first
    if (categorized.event.length > 0) {
      parts.push(`Event: ${categorized.event.join(' | ')}`);
    }

    // User context
    if (categorized.user.length > 0) {
      parts.push(`User: ${categorized.user.join(' | ')}`);
    }

    // Device info
    if (categorized.device.length > 0) {
      parts.push(`Device: ${categorized.device.join(' | ')}`);
    }

    // Location
    if (categorized.location.length > 0) {
      parts.push(`Location: ${categorized.location.join(' | ')}`);
    }

    // App info
    if (categorized.app.length > 0) {
      parts.push(`App: ${categorized.app.join(' | ')}`);
    }

    // Vendor info
    if (categorized.vendor.length > 0) {
      parts.push(`Vendor: ${categorized.vendor.join(' | ')}`);
    }

    // Screen info
    if (categorized.screen.length > 0) {
      parts.push(`Screen: ${categorized.screen.join(' | ')}`);
    }

    // Cart info
    if (categorized.cart.length > 0) {
      parts.push(`Cart: ${categorized.cart.join(' | ')}`);
    }

    // Session info
    if (categorized.session.length > 0) {
      parts.push(`Session: ${categorized.session.join(' | ')}`);
    }

    // Other important fields (limit to avoid too much noise)
    if (categorized.other.length > 0) {
      const importantOthers = categorized.other
        .filter(
          (field) => !field.includes('$set') && !field.includes('$set_once'),
        ) // Skip internal PostHog fields
        .slice(0, 10); // Limit to 10 other fields
      if (importantOthers.length > 0) {
        parts.push(`Other: ${importantOthers.join(' | ')}`);
      }
    }

    return parts.join('\n');
  }

  // Get and summarize user actions by vendor for the last 7 days
  async getUserActivitySummaryByVendor(
    userId: string,
  ): Promise<Record<string, string>> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const events = await this.posthogEventRepository.find({
      where: {
        person_id: userId,
        timestamp: MoreThanOrEqual(sevenDaysAgo),
      },
      order: { vendor_id: 'ASC', timestamp: 'ASC' },
    });

    // Group by vendor_id
    const grouped: Record<string, PosthogEvent[]> = {};
    for (const event of events) {
      if (!event.vendor_id) continue;
      if (!grouped[event.vendor_id]) grouped[event.vendor_id] = [];
      grouped[event.vendor_id].push(event);
    }

    // Summarize per vendor
    const summaries: Record<string, string> = {};
    for (const [vendorId, vendorEvents] of Object.entries(grouped)) {
      const actions = vendorEvents.map((e) => this.summarizeEvent(e));
      summaries[vendorId] = actions.join('\n');
    }

    return summaries;
  }

  // Find all uningested events for the first N unique users with uningested events (single query)
  async findUningestedEventsForNUniqueUsers(
    userLimit: number,
  ): Promise<PosthogEvent[]> {
    return this.posthogEventRepository
      .createQueryBuilder('event')
      .where('event.ingested_at IS NULL')
      .andWhere((qb) => {
        const subQuery = qb
          .subQuery()
          .select('DISTINCT subevent.person_id')
          .from(PosthogEvent, 'subevent')
          .where('subevent.ingested_at IS NULL')
          .limit(userLimit)
          .getQuery();
        return 'event.person_id IN ' + subQuery;
      })
      .orderBy('event.person_id', 'ASC')
      .addOrderBy('event.timestamp', 'ASC')
      .getMany();
  }

  // Get all uningested events grouped by user with efficient SQL grouping
  async findUningestedEventsGroupedByUser(
    userLimit: number,
  ): Promise<
    Map<
      string,
      { events: PosthogEvent[]; person_properties: Record<string, any> }
    >
  > {
    // First, get the distinct user IDs that have uningested events
    const userSubquery = this.posthogEventRepository
      .createQueryBuilder('subevent')
      .select('DISTINCT subevent.person_id, subevent.timestamp')
      .where('subevent.ingested_at IS NULL')
      .andWhere('subevent.person_id IS NOT NULL')
      .andWhere('subevent.vendor_id IS NOT NULL')
      .andWhere("subevent.person_properties->>'email' IS NOT NULL")
      .andWhere("subevent.person_properties->>'email' != ''")
      .andWhere('subevent.created_at >= :date', {
        date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      })
      .orderBy('subevent.timestamp', 'DESC')
      .limit(userLimit);

    // Then get all events for those users
    let events: PosthogEvent[] = [];
    try {
      events = await this.posthogEventRepository
        .createQueryBuilder('event')
        .where('event.ingested_at IS NULL')
        .andWhere(
          'event.person_id IN (SELECT DISTINCT person_id FROM (' +
            userSubquery.getQuery() +
            ') AS subq)',
        )
        .setParameters(userSubquery.getParameters())
        .andWhere('event.created_at >= :date', {
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        })
        .andWhere("event.person_properties->>'email' IS NOT NULL")
        .andWhere("event.person_properties->>'email' != ''")
        .orderBy('event.timestamp', 'DESC')
        .limit(30)
        .getMany();
    } catch (error) {
      console.error(error);
    }

    // Group by person_id and include person_properties
    const groupedEvents = new Map<
      string,
      { events: PosthogEvent[]; person_properties: Record<string, any> }
    >();

    for (const event of events) {
      if (!event.person_id) continue;

      if (!groupedEvents.has(event.person_id)) {
        groupedEvents.set(event.person_id, {
          events: [],
          person_properties: event.person_properties || {},
        });
      }
      groupedEvents.get(event.person_id).events.push(event);
    }

    return groupedEvents;
  }

  // Find all uningested events for a specific user
  async findUningestedEventsForUser(
    person_id: string,
  ): Promise<PosthogEvent[]> {
    return (
      this.posthogEventRepository
        .createQueryBuilder('event')
        .where('event.ingested_at IS NULL')
        .andWhere('event.person_id = :person_id', { person_id })
        .orderBy('event.created_at', 'ASC')
        // for last 7 days
        // .andWhere('event.created_at >= :date', {
        //   date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        // })
        .limit(30)
        .getMany()
    );
  }

  // Alternative: Get events with window functions for better performance
  async findUningestedEventsWithUserSessions(
    userLimit: number,
    sessionWindowMinutes: number = 30,
  ): Promise<
    Array<{
      person_id: string;
      events: PosthogEvent[];
      session_start: Date;
      session_end: Date;
    }>
  > {
    // This would be even more efficient with a raw SQL query using window functions
    // For now, we'll use the grouped approach and let the processor handle session creation
    const groupedEvents =
      await this.findUningestedEventsGroupedByUser(userLimit);

    const sessions: Array<{
      person_id: string;
      events: PosthogEvent[];
      session_start: Date;
      session_end: Date;
    }> = [];

    for (const [person_id, { events }] of groupedEvents) {
      if (events.length === 0) continue;

      // Sort events by timestamp
      events.sort(
        (a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0),
      );

      // Create sessions based on time windows
      const sessionWindow = sessionWindowMinutes * 60 * 1000; // milliseconds
      let currentSession: PosthogEvent[] = [];
      let sessionStart: Date | null = null;

      for (const event of events) {
        const eventTime = event.timestamp?.getTime() || 0;

        if (!sessionStart) {
          sessionStart = event.timestamp || new Date();
          currentSession = [event];
        } else {
          const timeDiff = eventTime - sessionStart.getTime();

          if (timeDiff <= sessionWindow) {
            currentSession.push(event);
          } else {
            // Create new session
            if (currentSession.length > 0) {
              const sessionEnd =
                currentSession[currentSession.length - 1]?.timestamp ||
                sessionStart;
              sessions.push({
                person_id,
                events: [...currentSession],
                session_start: sessionStart,
                session_end: sessionEnd,
              });
            }
            sessionStart = event.timestamp || new Date();
            currentSession = [event];
          }
        }
      }

      // Add the last session if it has events
      if (currentSession.length > 0) {
        const sessionEnd =
          currentSession[currentSession.length - 1]?.timestamp || sessionStart;
        sessions.push({
          person_id,
          events: [...currentSession],
          session_start: sessionStart,
          session_end: sessionEnd,
        });
      }
    }

    return sessions;
  }

  // Helper function to safely extract count from raw query result
  private extractCount(result: unknown): number {
    return Number((result as { count: string })?.count || 0);
  }

  // Count unique users with ingested events
  async countIngestedUsers(): Promise<number> {
    const result: unknown = await this.posthogEventRepository
      .createQueryBuilder('event')
      .select('COUNT(DISTINCT event.person_id)', 'count')
      .where('event.ingested_at IS NOT NULL')
      .andWhere('event.person_id IS NOT NULL')
      .getRawOne();

    return this.extractCount(result);
  }

  // Count unique users with uningested events
  async countUningestedUsers(): Promise<number> {
    const result: unknown = await this.posthogEventRepository
      .createQueryBuilder('event')
      .select('COUNT(DISTINCT event.person_id)', 'count')
      .where('event.ingested_at IS NULL')
      .andWhere('event.person_id IS NOT NULL')
      .getRawOne();

    return this.extractCount(result);
  }

  // Get comprehensive user ingestion stats
  async getUserIngestionStats(): Promise<{
    totalUsers: number;
    ingestedUsers: number;
    uningestedUsers: number;
    totalEvents: number;
    ingestedEvents: number;
    uningestedEvents: number;
  }> {
    const results: [unknown, number, number, number, number, number] =
      await Promise.all([
        // Total unique users
        this.posthogEventRepository
          .createQueryBuilder('event')
          .select('COUNT(DISTINCT event.person_id)', 'count')
          .where('event.person_id IS NOT NULL')
          .getRawOne(),

        // Users with ingested events
        this.countIngestedUsers(),

        // Users with uningested events
        this.countUningestedUsers(),

        // Total events
        this.posthogEventRepository.count(),

        // Ingested events
        this.posthogEventRepository
          .createQueryBuilder('event')
          .where('event.ingested_at IS NOT NULL')
          .getCount(),

        // Uningested events
        this.posthogEventRepository
          .createQueryBuilder('event')
          .where('event.ingested_at IS NULL')
          .getCount(),
      ]);

    const [
      totalUsersResult,
      ingestedUsers,
      uningestedUsers,
      totalEvents,
      ingestedEvents,
      uningestedEvents,
    ] = results;

    const totalUsers = this.extractCount(totalUsersResult);

    return {
      totalUsers,
      ingestedUsers,
      uningestedUsers,
      totalEvents,
      ingestedEvents,
      uningestedEvents,
    };
  }

  // Find unique users with uningested events (simple approach)
  async findUniqueUsersWithUningestedEvents(
    userLimit: number,
  ): Promise<string[]> {
    const distinctUsers = await this.posthogEventRepository
      .createQueryBuilder('event')
      .select('DISTINCT event.person_id')
      .where('event.ingested_at IS NULL')
      .andWhere('event.person_id IS NOT NULL')
      .orderBy('event.person_id', 'ASC')
      .limit(userLimit)
      .getRawMany();

    return distinctUsers
      .map((user: { person_id: string }) => user.person_id)
      .filter(
        (personId): personId is string =>
          personId !== null && personId !== undefined,
      );
  }

  // Mark all uningested events for a user as ingested
  async markAllUserEventsAsIngested(person_id: string): Promise<void> {
    try {
      await this.posthogEventRepository
        .createQueryBuilder()
        .update()
        .set({ ingested_at: new Date() })
        .where('person_id = :person_id', { person_id })
        .andWhere('ingested_at IS NULL')
        .execute();

      this.logger.log(
        `Marked all uningested events for user ${person_id} as ingested`,
      );
    } catch (error) {
      this.logger.log(
        `Error marking all uningested events for user ${person_id} as ingested`,
      );
      this.logger.log(error);
    }
  }
}
