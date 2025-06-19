import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum IngestionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  PARTIAL = 'partial', // Some events ingested, some failed
}

export enum FailureReason {
  EMBEDDING_GENERATION_FAILED = 'embedding_generation_failed',
  QDRANT_UPSERT_FAILED = 'qdrant_upsert_failed',
  DATABASE_ERROR = 'database_error',
  INVALID_DATA = 'invalid_data',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

@Entity('ingestion_attempts')
export class IngestionAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { nullable: true })
  person_id: string;

  @Column('text')
  job_type: string; // 'FIND_USERS' or 'PROCESS_USER'

  @Column({
    type: 'enum',
    enum: IngestionStatus,
    default: IngestionStatus.PENDING,
  })
  status: IngestionStatus;

  @Column({
    type: 'enum',
    enum: FailureReason,
    nullable: true,
  })
  failure_reason: FailureReason;

  @Column('text', { nullable: true })
  error_message: string;

  @Column('jsonb', { nullable: true })
  error_details: Record<string, any>;

  @Column('int', { default: 0 })
  events_processed: number;

  @Column('int', { default: 0 })
  events_total: number;

  @Column('jsonb', { nullable: true })
  metadata: {
    batch_size?: number;
    processing_time_ms?: number;
    embedding_size?: number;
    qdrant_collection?: string;
    retry_count?: number;
  };

  @Column('timestamp', { nullable: true })
  started_at: Date;

  @Column('timestamp', { nullable: true })
  completed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column('int', { default: 0 })
  retry_count: number;

  @Column('timestamp', { nullable: true })
  next_retry_at: Date;
}
