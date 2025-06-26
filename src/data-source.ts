import { DataSource } from 'typeorm';
import { Event } from './events/entities/event.entity';
import { PosthogEvent } from './events/entities/posthog-event.entity';
import { IngestionAttempt } from './events/entities/ingestion-attempt.entity';

export default new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 15432,
  username: 'postgres',
  password: 'postgres',
  database: 'rag_db',
  entities: [Event, PosthogEvent, IngestionAttempt],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: true,
});
