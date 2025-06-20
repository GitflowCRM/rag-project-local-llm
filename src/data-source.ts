import { DataSource } from 'typeorm';
import { Event } from './events/entities/event.entity';
import { PosthogEvent } from './events/entities/posthog-event.entity';

export default new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 15432,
  username: 'postgres',
  password: 'postgres',
  database: 'rag_db',
  entities: [Event, PosthogEvent],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: true,
});
