import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPosthogEventsTable1750352359097 implements MigrationInterface {
    name = 'AddPosthogEventsTable1750352359097'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_3df2866815333b30e56016b286"`);
        await queryRunner.query(`DROP INDEX "public"."idx_posthog_properties_vendor"`);
        await queryRunner.query(`ALTER TABLE "posthog_events" DROP CONSTRAINT "posthog_events_pkey"`);
        await queryRunner.query(`ALTER TABLE "posthog_events" DROP COLUMN "id"`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ADD "ingested_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ALTER COLUMN "uuid" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ADD CONSTRAINT "PK_6bc7248cb64b40b5a37ec6091d8" PRIMARY KEY ("uuid")`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ALTER COLUMN "event" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "posthog_events" DROP COLUMN "elements_chain"`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ADD "elements_chain" jsonb`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ALTER COLUMN "created_at" SET DEFAULT now()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "posthog_events" ALTER COLUMN "created_at" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "posthog_events" DROP COLUMN "elements_chain"`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ADD "elements_chain" text`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ALTER COLUMN "event" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "posthog_events" DROP CONSTRAINT "PK_6bc7248cb64b40b5a37ec6091d8"`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ALTER COLUMN "uuid" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "posthog_events" DROP COLUMN "ingested_at"`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ADD "id" uuid NOT NULL`);
        await queryRunner.query(`ALTER TABLE "posthog_events" ADD CONSTRAINT "posthog_events_pkey" PRIMARY KEY ("id")`);
        await queryRunner.query(`CREATE INDEX "idx_posthog_properties_vendor" ON "posthog_events" ("vendor_id") WHERE (properties IS NOT NULL)`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_3df2866815333b30e56016b286" ON "posthog_events" ("uuid") WHERE ((uuid IS NOT NULL) AND ((uuid)::text <> ''::text))`);
    }

}
