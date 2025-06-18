import { DataSource } from 'typeorm';
import { Event } from './events/entities/event.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.POSTGRES_DB || 'rag_db',
  entities: [Event],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: true,
});
