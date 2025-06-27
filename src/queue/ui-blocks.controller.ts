import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { QueueEventsService } from './queue-events.service';
import { CMSService } from '../cms.service';
import { QdrantService } from '../qdrant/qdrant.service';
import {
  BlockDetailDto,
  CmsBlock,
  QdrantSearchResponse,
  UiBlocksIngestionDto,
  UiBlocksIngestionResponseDto,
  UiBlocksStatusDto,
} from './dto';

@ApiTags('UI Blocks Ingestion')
@Controller('ui-blocks')
export class UiBlocksController {
  private readonly logger = new Logger(UiBlocksController.name);
  constructor(
    private readonly queueEventsService: QueueEventsService,
    private readonly cmsService: CMSService,
    private readonly qdrantService: QdrantService,
  ) {}

  @Post('ingest')
  @ApiOperation({
    summary: 'Ingest UI blocks for embedding',
    description:
      'Queues a job to process UI block definitions, generate embeddings, and store them in Qdrant',
  })
  @ApiResponse({
    status: 201,
    description: 'Ingestion job queued successfully',
    type: UiBlocksIngestionResponseDto,
  })
  async ingestUiBlocks(
    @Body() body: UiBlocksIngestionDto,
  ): Promise<UiBlocksIngestionResponseDto> {
    const batchSize = body.batchSize || 50;
    const filter = {
      is_default_component: {
        _neq: true,
      },
    };

    // Get count of blocks that will be processed
    let blocks: CmsBlock[] = [];
    try {
      blocks = (await this.cmsService.getItems(
        'ui_block_definitions',
        ['*'],
        filter,
        batchSize,
        1,
      )) as CmsBlock[];
    } catch (error) {
      this.logger.error(
        `Error fetching UI blocks: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    const blocksToProcess = Array.isArray(blocks) ? blocks.length : 0;

    // Queue the embedding job
    const result = await this.queueEventsService.queueUiBlocksEmbeddingJob({
      batchSize,
      filter,
    });

    return {
      status: result.status,
      blocksToProcess,
      batchSize,
      filter,
    };
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get UI blocks ingestion status',
    description:
      'Returns statistics about UI blocks in CMS vs embedded in Qdrant',
  })
  @ApiResponse({
    status: 200,
    description: 'Status retrieved successfully',
    type: UiBlocksStatusDto,
  })
  async getIngestionStatus(): Promise<UiBlocksStatusDto> {
    // Get total blocks from CMS
    const totalBlocks = await this.cmsService.getItems(
      'ui_block_definitions',
      ['id'],
      {},
    );
    const totalCount = Array.isArray(totalBlocks) ? totalBlocks.length : 0;

    // Get embedded blocks from Qdrant
    const dummyVector: number[] = Array.from({ length: 1536 }, () => 0);
    const embeddedResult = await this.qdrantService.search({
      collection: 'cms',
      vector: dummyVector,
      top: 0, // Get count only
      with_payload: false,
    });

    // Type guard for Qdrant response
    const qdrantResponse = embeddedResult as QdrantSearchResponse;
    const embeddedCount =
      typeof qdrantResponse.total === 'number' ? qdrantResponse.total : 0;

    const pendingCount = Math.max(0, totalCount - embeddedCount);
    const completionPercentage =
      totalCount > 0 ? (embeddedCount / totalCount) * 100 : 0;

    return {
      totalBlocks: totalCount,
      embeddedBlocks: embeddedCount,
      pendingBlocks: pendingCount,
      completionPercentage: Math.round(completionPercentage * 100) / 100,
    };
  }

  @Get('blocks')
  @ApiOperation({
    summary: 'List UI blocks with embedding status',
    description: 'Returns a list of UI blocks with their embedding status',
  })
  @ApiResponse({
    status: 200,
    description: 'Blocks retrieved successfully',
    type: [BlockDetailDto],
  })
  async listBlocks(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ): Promise<BlockDetailDto[]> {
    const limitValue = Math.min(limit || 50, 100); // Max 100 blocks per request
    const offsetValue = offset || 0;

    // Get blocks from CMS
    const blocks = await this.cmsService.getItems(
      'ui_block_definitions',
      ['id', 'description', 'block_id', 'updated_at'],
      {},
    );

    if (!Array.isArray(blocks)) {
      return [];
    }

    const blockDetails: BlockDetailDto[] = [];
    const dummyVector: number[] = Array.from({ length: 1536 }, () => 0);

    for (const block of blocks.slice(offsetValue, offsetValue + limitValue)) {
      // Type guard for CMS block
      const cmsBlock = block as CmsBlock;
      const blockId =
        typeof cmsBlock.block_id === 'string' ? cmsBlock.block_id : '';
      if (!blockId) continue;

      // Check if block is embedded in Qdrant
      const embeddedResult = await this.qdrantService.search({
        collection: 'cms',
        vector: dummyVector,
        top: 1,
        filter: { must: [{ key: 'block_id', match: { value: blockId } }] },
        with_payload: true,
      });

      const qdrantResponse = embeddedResult as QdrantSearchResponse;
      const isEmbedded =
        qdrantResponse.result && qdrantResponse.result.length > 0;
      const embeddedBlock = qdrantResponse.result?.[0];
      const payload = embeddedBlock?.payload;

      blockDetails.push({
        blockId,
        description:
          typeof cmsBlock.description === 'string' ? cmsBlock.description : '',
        isEmbedded,
        summary:
          typeof payload?.summary === 'string' ? payload.summary : undefined,
        lastUpdated:
          typeof cmsBlock.updated_at === 'string'
            ? cmsBlock.updated_at
            : undefined,
      });
    }

    return blockDetails;
  }

  @Get('blocks/:blockId')
  @ApiOperation({
    summary: 'Get specific UI block details',
    description: 'Returns detailed information about a specific UI block',
  })
  @ApiResponse({
    status: 200,
    description: 'Block details retrieved successfully',
    type: BlockDetailDto,
  })
  async getBlockDetails(
    @Param('blockId') blockId: string,
  ): Promise<BlockDetailDto | null> {
    // Get block from CMS
    const blocks = await this.cmsService.getItems(
      'ui_block_definitions',
      ['id', 'description', 'block_id', 'updated_at'],
      { block_id: blockId },
    );

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return null;
    }

    const block = blocks[0] as CmsBlock;

    // Check if block is embedded in Qdrant
    const dummyVector: number[] = Array.from({ length: 1536 }, () => 0);
    const embeddedResult = await this.qdrantService.search({
      collection: 'cms',
      vector: dummyVector,
      top: 1,
      filter: { must: [{ key: 'block_id', match: { value: blockId } }] },
      with_payload: true,
    });

    const qdrantResponse = embeddedResult as QdrantSearchResponse;
    const isEmbedded =
      qdrantResponse.result && qdrantResponse.result.length > 0;
    const embeddedBlock = qdrantResponse.result?.[0];
    const payload = embeddedBlock?.payload;

    return {
      blockId,
      description:
        typeof block.description === 'string' ? block.description : '',
      isEmbedded,
      summary:
        typeof payload?.summary === 'string' ? payload.summary : undefined,
      lastUpdated:
        typeof block.updated_at === 'string' ? block.updated_at : undefined,
    };
  }

  @Post('blocks/:blockId/ingest')
  @ApiOperation({
    summary: 'Ingest specific UI block',
    description: 'Queues a job to process and embed a specific UI block',
  })
  @ApiResponse({
    status: 201,
    description: 'Block ingestion job queued successfully',
    type: UiBlocksIngestionResponseDto,
  })
  async ingestSpecificBlock(
    @Param('blockId') blockId: string,
  ): Promise<UiBlocksIngestionResponseDto> {
    return this.ingestUiBlocks({
      blockId,
      batchSize: 1,
    });
  }
}
