import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { getQueueToken } from '@nestjs/bullmq';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Queue } from 'bullmq';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const logger = new Logger('Bootstrap');

  // CORS configuration
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:8081'],
    credentials: true,
    methods: ['POST', 'PUT', 'GET', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Enable validation
  app.useGlobalPipes(new ValidationPipe());

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('RAG API')
    .setDescription(
      'Retrieval-Augmented Generation API for querying user event data',
    )
    .setVersion('1.0')
    .addTag('rag')
    .addTag('events')
    .addTag('embeddings')
    .addTag('llm')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  // Bull Board setup (only enabled in debug mode)
  if (process.env.ENABLE_QUEUE_DEBUG === 'true') {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    // Get queue instances
    const eventsSyncQueue = app.get<Queue>(getQueueToken('event-sync'));
    const embeddingsQueue = app.get<Queue>(getQueueToken('embeddings'));

    // Initialize Bull Board
    createBullBoard({
      queues: [
        new BullMQAdapter(eventsSyncQueue),
        new BullMQAdapter(embeddingsQueue),
      ],
      serverAdapter,
    });

    // Mount Bull Board
    app.use('/admin/queues', serverAdapter.getRouter());
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Application started`);
  logger.log(`API service running on port ${port} 🚀`);
  if (process.env.ENABLE_QUEUE_DEBUG === 'true') {
    logger.log(`Bull Board: http://localhost:${port}/admin/queues`);
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start application:', err);
  process.exit(1);
});
