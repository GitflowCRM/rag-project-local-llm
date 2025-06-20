import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIngestionAttemptsTable1750352359098
  implements MigrationInterface
{
  name = 'AddIngestionAttemptsTable1750352359098';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "public"."ingestion_status_enum" AS ENUM('pending', 'processing', 'success', 'failed', 'partial')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."failure_reason_enum" AS ENUM('embedding_generation_failed', 'qdrant_upsert_failed', 'database_error', 'invalid_data', 'timeout', 'unknown')
    `);

    // Create table
    await queryRunner.query(`
      CREATE TABLE "ingestion_attempts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "person_id" uuid,
        "job_type" character varying NOT NULL,
        "status" "public"."ingestion_status_enum" NOT NULL DEFAULT 'pending',
        "failure_reason" "public"."failure_reason_enum",
        "error_message" character varying,
        "error_details" jsonb,
        "events_processed" integer NOT NULL DEFAULT '0',
        "events_total" integer NOT NULL DEFAULT '0',
        "metadata" jsonb,
        "started_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "retry_count" integer NOT NULL DEFAULT '0',
        "next_retry_at" TIMESTAMP,
        CONSTRAINT "PK_ingestion_attempts" PRIMARY KEY ("id")
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_ingestion_attempts_person_id" ON "ingestion_attempts" ("person_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ingestion_attempts_status" ON "ingestion_attempts" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ingestion_attempts_created_at" ON "ingestion_attempts" ("created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ingestion_attempts_job_type" ON "ingestion_attempts" ("job_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_ingestion_attempts_job_type"`);
    await queryRunner.query(`DROP INDEX "IDX_ingestion_attempts_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_ingestion_attempts_status"`);
    await queryRunner.query(`DROP INDEX "IDX_ingestion_attempts_person_id"`);

    // Drop table
    await queryRunner.query(`DROP TABLE "ingestion_attempts"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE "public"."failure_reason_enum"`);
    await queryRunner.query(`DROP TYPE "public"."ingestion_status_enum"`);
  }
}
