-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create events table with vector support
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    event_data JSONB NOT NULL,
    event_timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ingested_at TIMESTAMPTZ,
    embedding vector(1536)  -- OpenAI embeddings are 1536 dimensions
);

-- Create index on user_id and event_timestamp for faster queries
CREATE INDEX IF NOT EXISTS idx_events_user_timestamp ON events(user_id, event_timestamp);

-- Create index on event_type for filtering
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

-- Create function to calculate cosine similarity
CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector) RETURNS float AS $$
BEGIN
    RETURN 1 - (a <=> b);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT; 