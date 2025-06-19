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
