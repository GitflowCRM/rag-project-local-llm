export const QUEUE_NAMES = {
  EVENT_SYNC: 'event-sync',
  EMBEDDINGS: 'embeddings',
  POSTHOG_EVENTS: 'posthog-events',
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
    PROCESS_USER: 'posthog-events.process.user',
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
    PROCESS_USER: 'posthog-events.process.user',
  },
};

export const LLM_MODELS = {
  // REASONING: 'gemma-3-27b-it',
  // REASONING: 'qwq-32b',
  REASONING: 'mistral-7b-instruct-v0.3',
  // REASONING: 'mistral-7b-instruct-v0.3',
  // REASONING: 'deepseek-r1-distill-qwen-7b',
  SUMMARY: 'mistral-7b-instruct-v0.3',
};
