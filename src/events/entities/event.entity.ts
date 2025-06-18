import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: string;

  @Column()
  event_type: string;

  @Column('jsonb')
  event_data: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  event_timestamp: Date;

  @Column('float', { array: true, nullable: true })
  embedding: number[];
}
