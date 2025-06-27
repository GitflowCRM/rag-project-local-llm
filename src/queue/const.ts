export const QUEUE_NAMES = {
  EVENT_SYNC: 'event-sync',
  EMBEDDINGS: 'embeddings',
  POSTHOG_EVENTS: 'posthog-events',
  UI_BLOCKS_EMBEDDING: 'ui-blocks-embedding',
};

export const QUEUE_PROCESSORS = {
  // Named property aliases
  EVENT_SYNC: {
    SYNC_EVENTS: 'event-sync.sync.events',
  },
  EMBEDDINGS: {
    GENERATE_EMBEDDINGS: 'embeddings.generate.embeddings',
  },
  POSTHOG_EVENTS: {
    SYNC_POSTHOG_EVENTS: 'posthog-events.sync.posthog-events',
    FIND_USERS: 'posthog-events.find.users',
    FIND_UNIQUE_USERS: 'posthog-events.find.unique.users',
    PROCESS_USER: 'posthog-events.process.user',
  },
  UI_BLOCKS_EMBEDDING: {
    PROCESS_BLOCKS: 'ui-blocks-embedding.process.blocks',
  },
  // String key aliases for dynamic access
  [QUEUE_NAMES.EVENT_SYNC]: {
    SYNC_EVENTS: 'event-sync.sync.events',
  },
  [QUEUE_NAMES.EMBEDDINGS]: {
    GENERATE_EMBEDDINGS: 'embeddings.generate.embeddings',
  },
  [QUEUE_NAMES.POSTHOG_EVENTS]: {
    SYNC_POSTHOG_EVENTS: 'posthog-events.sync.posthog-events',
    FIND_USERS: 'posthog-events.find.users',
    FIND_UNIQUE_USERS: 'posthog-events.find.unique.users',
    PROCESS_USER: 'posthog-events.process.user',
  },
  [QUEUE_NAMES.UI_BLOCKS_EMBEDDING]: {
    PROCESS_BLOCKS: 'ui-blocks-embedding.process.blocks',
  },
};

export const LLM_MODELS = {
  // REASONING: 'gemma-3-27b-it',
  // REASONING: 'qwq-32b',
  REASONING: 'mistral-7b-instruct-v0.3',
  // REASONING: 'mistral-7b-instruct-v0.3',
  // REASONING: 'deepseek-r1-distill-qwen-7b',
  SUMMARY: 'gemma-3-27b-it',
};
