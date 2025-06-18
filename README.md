# RAG Backend with NestJS

A Retrieval-Augmented Generation (RAG) backend built with NestJS, capable of answering natural language questions about user event data stored in PostgreSQL.

## Features

- Event data storage in PostgreSQL with pgvector
- Semantic search using OpenAI embeddings
- Natural language querying using LLM
- RESTful API endpoints for data ingestion and querying

## Prerequisites

- Node.js (v18 or later)
- Bun package manager
- Docker and Docker Compose
- OpenAI API key

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd <repository-name>
```

2. Install dependencies:
```bash
bun install
```

3. Create a `.env` file in the root directory:
```env
OPENAI_API_KEY=your-api-key-here
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/rag_db
```

4. Start the PostgreSQL database:
```bash
docker-compose up -d
```

5. Start the application:
```bash
bun run start:dev
```

## API Endpoints

### Events

- `POST /events` - Create a new event
```json
{
  "user_id": "user123",
  "event_type": "purchase",
  "event_data": {
    "product_id": "prod123",
    "amount": 99.99
  }
}
```

- `GET /events` - Get all events
- `GET /events/user/:userId` - Get events for a specific user
- `GET /events/type/:eventType` - Get events of a specific type

### RAG Query

- `POST /rag/query` - Query the RAG system
```json
{
  "question": "How many users placed an order in the last 24 hours?",
  "filters": {
    "eventType": "purchase"
  }
}
```

## Architecture

The application is built with the following components:

1. **Events Module**: Handles event data storage and retrieval
2. **Embeddings Module**: Generates and manages vector embeddings
3. **LLM Module**: Interfaces with the language model
4. **RAG Module**: Orchestrates the retrieval and generation process

## Development

- The application uses TypeORM for database operations
- OpenAI's text-embedding-3-small model for embeddings
- Custom LLM endpoint for text generation
- PostgreSQL with pgvector for vector similarity search

## License

MIT
