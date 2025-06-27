import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CMSService } from '../cms.service';
import { LlmService } from '../llm/llm.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { QUEUE_NAMES, QUEUE_PROCESSORS } from './const';
import { UI_BLOCK_SUMMARY_PROMPT } from '../prompts';
import { randomUUID } from 'crypto';

interface UiBlockDefinition {
  id: string;
  description: string;
  block_id: string;
  initialConfig: any;
}

interface UiBlocksEmbeddingJobData {
  filter?: Record<string, unknown>;
  batchSize?: number;
}

@Processor(QUEUE_NAMES.UI_BLOCKS_EMBEDDING, { concurrency: 1 })
export class UiBlocksEmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(UiBlocksEmbeddingProcessor.name);

  constructor(
    private readonly cmsService: CMSService,
    private readonly llmService: LlmService,
    private readonly qdrantService: QdrantService,
  ) {
    super();
    this.logger.log(
      `BullMQ Processor initialized for queue: ${QUEUE_NAMES.UI_BLOCKS_EMBEDDING}`,
    );
  }

  async process(job: Job<UiBlocksEmbeddingJobData>): Promise<void> {
    this.logger.log(
      `[UiBlocksEmbeddingProcessor] Starting job ${job.id} with data: ${JSON.stringify(job.data)}`,
    );

    const startTime = Date.now();

    try {
      switch (job.name) {
        case QUEUE_PROCESSORS.UI_BLOCKS_EMBEDDING.PROCESS_BLOCKS:
          await this.handleProcessBlocks(job.data);
          break;
        default:
          this.logger.warn(
            `[UiBlocksEmbeddingProcessor] Unhandled job type: ${job.name}`,
          );
      }

      this.logger.log(
        `[UiBlocksEmbeddingProcessor] Successfully completed job ${job.id} in ${Date.now() - startTime}ms`,
      );
    } catch (error) {
      this.logger.error(
        `[UiBlocksEmbeddingProcessor] Error processing job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
      throw error; // Re-throw to mark job as failed
    }
  }

  private async handleProcessBlocks(
    data: UiBlocksEmbeddingJobData,
  ): Promise<void> {
    const filter = data.filter || {};
    const rawBlocks = await this.cmsService.getItems(
      'ui_block_definitions',
      ['id', 'description', 'block_id', 'initialConfig'],
      filter,
      data.batchSize,
      1,
    );
    // Ensure blocks is UiBlockDefinition[] and filter out any non-object values
    const blocks: UiBlockDefinition[] = Array.isArray(rawBlocks)
      ? rawBlocks.filter(
          (b): b is UiBlockDefinition =>
            b &&
            typeof b === 'object' &&
            'block_id' in b &&
            'description' in b &&
            'initialConfig' in b,
        )
      : [];

    let processed = 0,
      skipped = 0;
    for (const block of blocks) {
      // Use explicit property access to avoid unsafe destructuring
      const block_id = typeof block.block_id === 'string' ? block.block_id : '';
      const description =
        typeof block.description === 'string' ? block.description : '';
      // Accept initialConfig as unknown, only assign if object or primitive
      const initialConfig: unknown =
        block.initialConfig !== undefined ? block.initialConfig : null;
      // Type guard for initialConfig to ensure it's not any
      const safeInitialConfig =
        initialConfig !== null &&
        (typeof initialConfig === 'object' ||
          typeof initialConfig === 'string' ||
          typeof initialConfig === 'number' ||
          typeof initialConfig === 'boolean')
          ? initialConfig
          : null;

      // Skip if already in Qdrant (cms collection)
      // Create a dummy vector with correct dimension (1536) for filter-only search
      const dummyVector: number[] = Array.from({ length: 1536 }, () => 0);
      const exists = await this.qdrantService.search({
        collection: 'cms',
        vector: dummyVector,
        top: 1,
        filter: { must: [{ key: 'block_id', match: { value: block_id } }] },
        with_payload: true,
      });
      if (exists.result && exists.result.length > 0) {
        this.logger.log(`Skipping duplicate block_id: ${block_id}`);
        skipped++;
        continue;
      }

      // Generate summary/metadata with LLM
      const prompt = UI_BLOCK_SUMMARY_PROMPT({ description, initialConfig });
      let llmResult: string = '';
      try {
        const result = await this.llmService.generateResponse({
          prompt,
          stream: false,
        });
        llmResult =
          typeof result === 'string' ? result : JSON.stringify(result);
      } catch (error) {
        this.logger.error(
          `LLM call failed for block_id ${block_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      let summary = '',
        metadata: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(llmResult) as {
          summary: string;
          metadata: Record<string, unknown>;
        };
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          Object.prototype.hasOwnProperty.call(parsed, 'summary') &&
          typeof (parsed as { summary: unknown }).summary === 'string'
        ) {
          summary = (parsed as { summary: string }).summary;
          // Only assign metadata if parsed is a plain object
          if (Object.prototype.toString.call(parsed) === '[object Object]') {
            metadata = parsed as Record<string, unknown>;
          } else {
            metadata = { summary };
          }
        } else {
          summary = llmResult.slice(0, 200);
          metadata = { summary: llmResult };
        }
      } catch {
        summary = llmResult.slice(0, 200);
        metadata = { summary: llmResult };
      }

      // Helper to deeply sanitize any object for upsert
      function sanitizeForUpsert(obj: unknown): Record<string, unknown> {
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          const result: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj)) {
            if (
              value === null ||
              typeof value === 'string' ||
              typeof value === 'number' ||
              typeof value === 'boolean' ||
              Array.isArray(value)
            ) {
              result[key] = value;
            } else if (typeof value === 'object') {
              result[key] = sanitizeForUpsert(value);
            } else {
              result[key] = null;
            }
          }
          return result;
        }
        return {};
      }

      // Embed summary + metadata
      const embeddingInput = summary + ' ' + JSON.stringify(metadata);
      let embedding: number[] = [];
      try {
        embedding = await this.llmService.getEmbedding(embeddingInput);
      } catch (error) {
        this.logger.error(
          `Embedding failed for block_id ${block_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      // Upsert to Qdrant (cms collection)
      try {
        // Generate a UUID for the point ID since Qdrant requires integer or UUID
        const pointId = randomUUID();
        await this.qdrantService.upsert(
          'cms',
          pointId,
          embedding,
          sanitizeForUpsert({
            block_id: typeof block_id === 'string' ? block_id : '',
            summary: typeof summary === 'string' ? summary : '',
            metadata: sanitizeForUpsert(metadata),
            description: typeof description === 'string' ? description : '',
            initialConfig: safeInitialConfig,
          }),
        );
      } catch (error) {
        this.logger.error(
          `Qdrant upsert failed for block_id ${block_id}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      this.logger.log(`Processed block_id: ${block_id}`);
      processed++;
    }
    this.logger.log(`Done. Processed: ${processed}, Skipped: ${skipped}`);
  }
}
