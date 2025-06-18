import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { EventsService } from '../events.service';
import { RagService } from '../../rag/rag.service';

async function seedEvents() {
  const app = await NestFactory.create(AppModule);
  const eventsService = app.get(EventsService);
  const ragService = app.get(RagService);

  const sampleEvents = [
    {
      user_id: 'user1',
      event_type: 'purchase',
      event_timestamp: new Date(),
      event_data: {
        product_id: 'prod1',
        amount: 99.99,
        items: ['item1', 'item2'],
        payment_method: 'credit_card',
      },
    },
    {
      user_id: 'user2',
      event_type: 'view',
      event_timestamp: new Date(),
      event_data: {
        product_id: 'prod2',
        duration: 120,
        source: 'search',
      },
    },
    {
      user_id: 'user1',
      event_type: 'cart_add',
      event_timestamp: new Date(),
      event_data: {
        product_id: 'prod3',
        quantity: 2,
        price: 49.99,
      },
    },
  ];

  try {
    // Insert events
    for (const event of sampleEvents) {
      await eventsService.create(event);
    }
    console.log('✅ Events seeded successfully');

    // Generate embeddings
    await ragService.ingest();
    console.log('✅ Embeddings generated successfully');

    // Test search
    const result = await ragService.query('What products did user1 purchase?');
    console.log('🔍 Search result:', result);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await app.close();
  }
}

seedEvents().catch(console.error);
