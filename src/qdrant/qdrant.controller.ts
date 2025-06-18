import { Controller, Post, Body } from '@nestjs/common';
import { QdrantService } from './qdrant.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsNotEmpty,
} from 'class-validator';

class IngestDto {
  @IsString()
  @IsNotEmpty()
  collection: string;
}

class SearchDto {
  @IsString()
  @IsNotEmpty()
  collection: string;

  @IsArray()
  @IsNumber({}, { each: true })
  vector: number[];

  @IsOptional()
  @IsNumber()
  top?: number;
}

class SemanticSearchDto {
  @IsString()
  @IsNotEmpty()
  collection: string;

  @IsString()
  @IsNotEmpty()
  query: string;

  @IsOptional()
  @IsNumber()
  top?: number;
}

@ApiTags('Qdrant')
@Controller('qdrant')
export class QdrantController {
  constructor(private readonly qdrantService: QdrantService) {}

  @Post('ingest')
  @ApiOperation({ summary: 'Ingest all un-ingested events to Qdrant' })
  @ApiBody({ type: IngestDto })
  @ApiResponse({
    status: 200,
    description: 'Returns number of ingested events',
  })
  async ingestAll(@Body() body: IngestDto): Promise<{ ingested: number }> {
    return await this.qdrantService.ingestAllEventsToQdrant(body.collection);
  }

  @Post('search')
  @ApiOperation({ summary: 'Search for similar vectors in Qdrant' })
  @ApiBody({ type: SearchDto })
  @ApiResponse({ status: 200, description: 'Returns search results' })
  async search(@Body() body: SearchDto): Promise<any> {
    return await this.qdrantService.search(
      body.collection,
      body.vector,
      body.top ?? 5,
    );
  }

  @Post('semantic-search')
  @ApiOperation({ summary: 'Search for semantically similar content' })
  @ApiBody({ type: SemanticSearchDto })
  @ApiResponse({
    status: 200,
    description: 'Returns semantically similar results',
  })
  async semanticSearch(@Body() body: SemanticSearchDto): Promise<any> {
    return await this.qdrantService.semanticSearch(
      body.collection,
      body.query,
      body.top ?? 5,
    );
  }
}
