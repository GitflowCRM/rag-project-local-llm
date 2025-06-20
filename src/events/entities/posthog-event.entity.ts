import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';

@Entity('posthog_events')
export class PosthogEvent {
  @PrimaryColumn('uuid')
  uuid: string;

  @Column('text')
  event: string;

  @Column('jsonb', { nullable: true })
  properties: Record<string, any>;

  @Column('jsonb', { nullable: true })
  person_properties: Record<string, any>;

  @Column('jsonb', { nullable: true })
  elements_chain: Record<string, any>;

  @Column('jsonb', { nullable: true })
  set: Record<string, any>;

  @Column('jsonb', { nullable: true })
  set_once: Record<string, any>;

  @Column('uuid', { nullable: true })
  distinct_id: string;

  @Column('uuid', { nullable: true })
  person_id: string;

  @CreateDateColumn({ type: 'timestamp', nullable: true })
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  _inserted_at: Date;

  @Column('text', { nullable: true })
  ip: string;

  @Column({ type: 'timestamp', nullable: true })
  timestamp: Date;

  @Column({ type: 'timestamp', nullable: true })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  updatedAt: Date;

  @Column('text', { nullable: true })
  vendor_id: string;

  @Column('text', { nullable: true })
  shopdomain: string;

  @Column({ type: 'timestamp', nullable: true })
  ingested_at: Date;
}
