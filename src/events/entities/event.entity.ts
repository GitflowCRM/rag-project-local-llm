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

  @Column({ type: 'timestamp with time zone' })
  event_timestamp: Date;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  ingested_at: Date | null;
}
