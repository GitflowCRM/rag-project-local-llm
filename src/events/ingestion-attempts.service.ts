import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { IngestionAttempt, IngestionStatus, FailureReason } from './entities/ingestion-attempt.entity';

@Injectable()
export class IngestionAttemptsService {
  private readonly logger = new Logger(IngestionAttemptsService.name);

  constructor(
    @InjectRepository(IngestionAttempt)
    private readonly ingestionAttemptRepository: Repository<IngestionAttempt>,
  ) {}

  async createAttempt(data: {
    person_id?: string;
    job_type: string;
    events_total?: number;
    metadata?: Record<string, any>;
  }): Promise<IngestionAttempt> {
    const attempt = this.ingestionAttemptRepository.create({
      ...data,
      status: IngestionStatus.PENDING,
      started_at: new Date(),
    });

    return this.ingestionAttemptRepository.save(attempt);
  }

  async markAsProcessing(attemptId: string): Promise<void> {
    await this.ingestionAttemptRepository.update(attemptId, {
      status: IngestionStatus.PROCESSING,
      started_at: new Date(),
    });
  }

  async markAsSuccess(attemptId: string, data: {
    events_processed: number;
    processing_time_ms?: number;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.ingestionAttemptRepository.update(attemptId, {
      status: IngestionStatus.SUCCESS,
      events_processed: data.events_processed,
      completed_at: new Date(),
      metadata: {
        ...data.metadata,
        processing_time_ms: data.processing_time_ms,
      },
    });
  }

  async markAsFailed(attemptId: string, data: {
    failure_reason: FailureReason;
    error_message: string;
    error_details?: Record<string, any>;
    events_processed?: number;
  }): Promise<void> {
    await this.ingestionAttemptRepository.update(attemptId, {
      status: IngestionStatus.FAILED,
      failure_reason: data.failure_reason,
      error_message: data.error_message,
      error_details: data.error_details,
      events_processed: data.events_processed || 0,
      completed_at: new Date(),
    });
  }

  async markAsPartial(attemptId: string, data: {
    events_processed: number;
    events_total: number;
    failure_reason: FailureReason;
    error_message: string;
    error_details?: Record<string, any>;
  }): Promise<void> {
    await this.ingestionAttemptRepository.update(attemptId, {
      status: IngestionStatus.PARTIAL,
      events_processed: data.events_processed,
      events_total: data.events_total,
      failure_reason: data.failure_reason,
      error_message: data.error_message,
      error_details: data.error_details,
      completed_at: new Date(),
    });
  }

  async getFailedAttempts(limit = 50): Promise<IngestionAttempt[]> {
    return this.ingestionAttemptRepository.find({
      where: {
        status: IngestionStatus.FAILED,
      },
      order: {
        created_at: 'DESC',
      },
      take: limit,
    });
  }

  async getFailedAttemptsByPersonId(person_id: string): Promise<IngestionAttempt[]> {
    return this.ingestionAttemptRepository.find({
      where: {
        person_id,
        status: IngestionStatus.FAILED,
      },
      order: {
        created_at: 'DESC',
      },
    });
  }

  async getRetryableAttempts(): Promise<IngestionAttempt[]> {
    const now = new Date();
    return this.ingestionAttemptRepository.find({
      where: {
        status: IngestionStatus.FAILED,
        retry_count: LessThan(3), // Max 3 retries
        next_retry_at: LessThan(now),
      },
      order: {
        created_at: 'ASC',
      },
    });
  }

  async incrementRetryCount(attemptId: string): Promise<void> {
    const attempt = await this.ingestionAttemptRepository.findOne({
      where: { id: attemptId },
    });

    if (attempt) {
      const newRetryCount = attempt.retry_count + 1;
      const nextRetryAt = new Date(Date.now() + Math.pow(2, newRetryCount) * 60000); // Exponential backoff

      await this.ingestionAttemptRepository.update(attemptId, {
        retry_count: newRetryCount,
        next_retry_at: newRetryCount < 3 ? nextRetryAt : null,
        status: newRetryCount >= 3 ? IngestionStatus.FAILED : IngestionStatus.PENDING,
      });
    }
  }

  async getStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    success: number;
    failed: number;
    partial: number;
    byFailureReason: Record<string, number>;
  }> {
    const [total, pending, processing, success, failed, partial] = await Promise.all([
      this.ingestionAttemptRepository.count(),
      this.ingestionAttemptRepository.count({ where: { status: IngestionStatus.PENDING } }),
      this.ingestionAttemptRepository.count({ where: { status: IngestionStatus.PROCESSING } }),
      this.ingestionAttemptRepository.count({ where: { status: IngestionStatus.SUCCESS } }),
      this.ingestionAttemptRepository.count({ where: { status: IngestionStatus.FAILED } }),
      this.ingestionAttemptRepository.count({ where: { status: IngestionStatus.PARTIAL } }),
    ]);

    // Get failure reasons breakdown
    const failureReasons = await this.ingestionAttemptRepository
      .createQueryBuilder('attempt')
      .select('attempt.failure_reason', 'reason')
      .addSelect('COUNT(*)', 'count')
      .where('attempt.status = :status', { status: IngestionStatus.FAILED })
      .groupBy('attempt.failure_reason')
      .getRawMany();

    const byFailureReason: Record<string, number> = {};
    failureReasons.forEach((item) => {
      byFailureReason[item.reason] = Number(item.count);
    });

    return {
      total,
      pending,
      processing,
      success,
      failed,
      partial,
      byFailureReason,
    };
  }

  async getRecentAttempts(limit = 20): Promise<IngestionAttempt[]> {
    return this.ingestionAttemptRepository.find({
      order: {
        created_at: 'DESC',
      },
      take: limit,
    });
  }
} 