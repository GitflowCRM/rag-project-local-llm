import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { QdrantService, QdrantSearchResult } from './qdrant.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { IsString, IsArray, IsNumber, IsOptional } from 'class-validator';

class SearchDto {
  @IsString()
  collection: string;

  @IsArray()
  @IsNumber({}, { each: true })
  vector: number[];

  @IsOptional()
  @IsNumber()
  top?: number;
}

class IngestDto {
  @IsString()
  collection: string;

  @IsString()
  id: string;

  @IsArray()
  @IsNumber({}, { each: true })
  vector: number[];

  payload: Record<string, any>;
}

@ApiTags('Qdrant Vector Database')
@Controller('qdrant')
export class QdrantController {
  constructor(private readonly qdrantService: QdrantService) {}

  @Get('health')
  @ApiOperation({ summary: 'Check Qdrant health status' })
  @ApiResponse({ status: 200, description: 'Qdrant is healthy' })
  async getHealth(): Promise<any> {
    return await this.qdrantService.getHealth();
  }

  @Get('collections')
  @ApiOperation({ summary: 'List all collections' })
  @ApiResponse({ status: 200, description: 'List of collections' })
  async getCollections(): Promise<any> {
    return await this.qdrantService.getCollections();
  }

  @Get('collections/:collectionName/stats')
  @ApiOperation({ summary: 'Get collection statistics' })
  @ApiResponse({ status: 200, description: 'Collection statistics' })
  async getCollectionStats(
    @Param('collectionName') collectionName: string,
  ): Promise<any> {
    return await this.qdrantService.getCollectionStats(collectionName);
  }

  @Get('collections/:collectionName/count')
  @ApiOperation({ summary: 'Get total number of records in collection' })
  @ApiResponse({ status: 200, description: 'Record count' })
  async getCollectionCount(
    @Param('collectionName') collectionName: string,
  ): Promise<any> {
    return await this.qdrantService.getCollectionCount(collectionName);
  }

  @Post('ingest')
  @ApiOperation({ summary: 'Ingest data into Qdrant collection' })
  @ApiBody({ type: IngestDto })
  @ApiResponse({ status: 201, description: 'Data ingested successfully' })
  async ingest(@Body() body: IngestDto): Promise<any> {
    return await this.qdrantService.upsert(
      body.collection,
      body.id,
      body.vector,
      body.payload,
    );
  }

  @Post('search')
  @ApiOperation({ summary: 'Search vectors in collection' })
  @ApiBody({ type: SearchDto })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search(@Body() body: SearchDto): Promise<QdrantSearchResult> {
    return await this.qdrantService.search(
      body.collection,
      body.vector,
      body.top,
    );
  }
}
