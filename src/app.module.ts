import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { EventsModule } from './events/events.module';
import { RagModule } from './rag/rag.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { LlmModule } from './llm/llm.module';
import { DataSource } from 'typeorm';
import { WithLengthColumnType } from 'typeorm/driver/types/ColumnTypes';
import { QdrantModule } from './qdrant/qdrant.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.POSTGRES_HOST,
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        username: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
        database: process.env.POSTGRES_DB,
        autoLoadEntities: true,
        synchronize: false,
        logging: true,
      }),
      dataSourceFactory: async (options) => {
        if (!options) {
          throw new Error('DataSource options are required');
        }
        const dataSource = new DataSource(options);

        // Push vector into length column type
        dataSource.driver.supportedDataTypes.push(
          'vector' as WithLengthColumnType,
        );
        dataSource.driver.withLengthColumnTypes.push(
          'vector' as WithLengthColumnType,
        );

        // Initialize datasource
        await dataSource.initialize();

        return dataSource;
      },
    }),
    QueueModule,
    EventsModule,
    RagModule,
    EmbeddingsModule,
    LlmModule,
    QdrantModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
