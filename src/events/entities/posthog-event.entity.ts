import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('posthog_events')
export class PosthogEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { nullable: true })
  event: string;

  @Column('jsonb', { nullable: true })
  properties: Record<string, any>;

  @Column('jsonb', { nullable: true })
  person_properties: Record<string, any>;

  @Column('text', { nullable: true })
  elements_chain: string;

  @Column('jsonb', { nullable: true })
  set: Record<string, any>;

  @Column('jsonb', { nullable: true })
  set_once: Record<string, any>;

  @Column('varchar', { nullable: true })
  distinct_id: string;

  @Column('varchar', { nullable: true })
  person_id: string;

  @Column('varchar', { nullable: true })
  uuid: string;

  @CreateDateColumn({ type: 'timestamp', nullable: true })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  _inserted_at: Date;

  @Column('varchar', { nullable: true })
  ip: string;

  @Column({ type: 'timestamp', nullable: true })
  timestamp: Date;

  @Column({ type: 'timestamp', nullable: true })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt: Date;

  @Column('varchar', { nullable: true })
  vendor_id: string;

  @Column('varchar', { name: 'shopDomain', nullable: true })
  shopDomain: string;

  @Column({ type: 'timestamp', nullable: true })
  ingested_at: Date;
}
