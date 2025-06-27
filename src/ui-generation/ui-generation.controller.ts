import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Logger,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import {
  UiGenerationService,
  UiGenerationRequest,
  UiGenerationResponse,
} from './ui-generation.service';

class GenerateUiDto {
  query: string;
  context?: string;
  style?: string;
  layout?: string;
  components?: string[];
  maxResults?: number;
}

@ApiTags('UI Generation')
@Controller('ui-generation')
export class UiGenerationController {
  private readonly logger = new Logger(UiGenerationController.name);

  constructor(private readonly uiGenerationService: UiGenerationService) {}

  @Post('generate')
  @ApiOperation({
    summary: 'Generate UI code using vendor blocks',
    description:
      'Generate UI code based on natural language query using vendor blocks and LLM',
  })
  @ApiResponse({
    status: 201,
    description: 'UI code generated successfully',
    type: Object, // UiGenerationResponse
  })
  async generateUi(@Body() body: GenerateUiDto): Promise<UiGenerationResponse> {
    this.logger.log(`Generating UI for query: ${body.query}`);

    const request: UiGenerationRequest = {
      query: body.query,
      context: body.context,
      style: body.style,
      layout: body.layout,
      components: body.components,
      maxResults: body.maxResults || 5,
    };

    return await this.uiGenerationService.generateUi(request);
  }

  @Get('similar/:blockId')
  @ApiOperation({
    summary: 'Find similar UI blocks',
    description:
      'Find UI blocks similar to the specified block using vendor blocks data',
  })
  @ApiResponse({
    status: 200,
    description: 'Similar blocks found successfully',
    type: [Object], // Array of similar blocks
  })
  getSimilarBlocks(
    @Param('blockId') blockId: string,
    @Query('maxResults') maxResults?: number,
  ) {
    this.logger.log(`Finding similar blocks for: ${blockId}`);

    return this.uiGenerationService.getSimilarBlocks(blockId, maxResults || 5);
  }

  @Post('generate-stream')
  @ApiOperation({
    summary: 'Generate UI code with streaming response',
    description:
      'Generate UI code with streaming response for real-time feedback using Server-Sent Events',
  })
  @ApiResponse({
    status: 201,
    description: 'UI code generation started with streaming',
  })
  async generateUiStream(
    @Body() body: GenerateUiDto,
    @Res() res: Response,
  ): Promise<UiGenerationResponse | void> {
    this.logger.log(`Starting UI generation for query: ${body.query}`);

    const request: UiGenerationRequest = {
      query: body.query,
      context: body.context,
      style: body.style,
      layout: body.layout,
      components: body.components,
      maxResults: body.maxResults || 5,
    };

    try {
      // Set OpenAI-style streaming headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      // Process UI generation with streaming
      try {
        await this.uiGenerationService.generateUiStream(request, res);
      } catch (error) {
        this.logger.error(`Error in streaming UI generation: ${error}`);
        res.write(
          `data: ${JSON.stringify({
            type: 'error',
            message:
              error instanceof Error ? error.message : 'Unknown error occurred',
          })}\n\n`,
        );
        res.end();
      }
    } catch (error) {
      this.logger.error(`Error in streaming UI generation: ${error}`);
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message:
            error instanceof Error ? error.message : 'Unknown error occurred',
        })}\n\n`,
      );
      res.end();
    }
  }

  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Check if the UI generation service is healthy',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
  })
  healthCheck() {
    return {
      status: 'healthy',
      service: 'ui-generation',
      timestamp: new Date().toISOString(),
      features: {
        vendorBlocks: true,
        streaming: true,
        similarBlocks: true,
      },
    };
  }
}
