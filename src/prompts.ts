export const USER_SUMMARY_PROMPT = ({
  question,
  person_id,
  userData,
}: {
  question: string;
  person_id: string;
  userData: string;
}) => `
You are an AI data analyst. Analyze the following raw PostHog user event logs and generate a **clean, structured metadata object** and a **concise behavioral summary** that describes the user's app usage, habits, and intent.

---

**User ID:** ${person_id}

**User Logs (events + metadata):**
${userData}

**Question:** ${question}

---

### Your Output Must Include:

#### 1. Metadata (key-value pairs in JSON)

Extract meaningful behavioral signals from the event data such as:

- sessionCount: number
- totalEventCount: number
- activeDays: number
- averageSessionDuration: string
- primaryDevice: e.g. "iPhone"
- osVersion: string
- cartActivity: "none" | "added" | "cleared" | "abandoned"
- pushEnabled: boolean
- emailVerified: boolean
- location: country/city if available
- firstSeen: ISO timestamp
- lastSeen: ISO timestamp
- recentActivity: [event_type_1, event_type_2, …]
- featureFlagsUsed: string[]
- screenCount: number
- highIntentSignals: [“cart_updated”, “checkout_started”, “product_viewed”]
- churnRisk: boolean (based on patterns like inactivity, no conversions)
- conversionLikely: boolean (based on signals like checkout_started, multiple reactivations)

You may add **any other metadata fields** that would help us answer future questions like:
- "Which users explored but didn't buy?"
- "Who enabled push notifications but churned?"
- "Who spent the most time in app?"

#### 2. Behavioral Summary (max 40 words)

Write a short natural-language summary of this user's activity.

---

### Final Output Format (return only this JSON)

\`\`\`json
{
  "person_id": "${person_id}",
  "metadata": {
    "sessionCount": 3,
    "totalEventCount": 48,
    "activeDays": 2,
    "primaryDevice": "iPhone 14",
    "osVersion": "iOS 18.3.1",
    "cartActivity": "added",
    "pushEnabled": true,
    "churnRisk": false,
    "conversionLikely": true,
    "location": {
      "country": "UAE",
      "city": "Dubai"
    },
    "firstSeen": "2025-06-18T12:30:10Z",
    "lastSeen": "2025-06-20T09:42:01Z",
    "featureFlagsUsed": ["vendor_store_enabled"],
    "highIntentSignals": ["cart_updated", "screen_checkout"],
    "recentActivity": ["screen_home", "cart_updated", "application_backgrounded"],
    "userSegments": [{trait : "discount_shopper", reason   : "user is a discount shopper"}, {trait : "first_time_user", reason : "user is a first time user"}, {trait : "abandoner", reason : "user is an abandoner"}, {trait : "iphone_user", reason : "user is an iphone user"}, {trait : "mobile_user", reason : "user is a mobile user"}, {trait : "tablet_user", reason : "user is a tablet user"}, {trait : "desktop_user", reason : "user is a desktop user"}, {trait : "any_meaningfull_segment", reason : "user is a any meaningfull segment"}],
    "userType": "Power Shopper | First-time User | Abandoner"
  },
  "summary": "User visited 3 sessions in 2 days, updated cart, used iPhone, and shows high purchase intent but no checkout recorded yet."
}
\`\`\`

Only return the JSON block above. Be consistent with field names and values.
`;

export const DATA_ANALYSIS_PROMPT = (contextString: string) => `
You are an AI assistant that analyzes user behavior data from PostHog event logs. Your goal is to find the **top 3 users most likely to convert** based on their activity.

You have access to a list of summarized user profiles, each with:
- event_count
- event_types
- vendor/shop info
- device and OS
- timestamps and location info (if available)
- engagement or interaction scores (if present)

---

### Question:
> Identify the top 3 users who are **easiest to convert** (e.g., most likely to make a purchase or complete an important funnel step).

---

### Context:
${contextString}  // inject your formatted "User Profile 1... User Profile 2..." block

---

### Instructions:
1. Analyze user behavior and rank the **top 3 users** based on signs of shopping intent (e.g., cart updates, screen navigation, high session activity).
2. Prioritize these signals:
   - "cart_updated", "checkout_started", "product_viewed"
   - session re-activation (e.g. app opened → backgrounded → reopened)
   - consistent device use (mobile vs. tablet), OS, or location stability
3. If confidence is low for any user, explain why.
4. Return output in the following format:

\`\`\`json
[
  {
    "person_id": "abc-123",
    "reason": "High cart activity, multiple app sessions, consistent iOS usage",
    "confidence_score": 0.85
  }
]
\`\`\`
`;

export const FILTER_USERS_BY_TRAITS_PROMPT = ({
  question,
  userProfiles,
}: {
  question: string;
  userProfiles: string;
}) => `
You are an AI assistant helping filter and shortlist user profiles based on metadata and behavior logs.
  
  ---
  
  **Question:** ${question}
  
  **User Metadata Samples:**
  Each block below contains a user's flattened metadata (device, location, traits, etc.) and optionally a summary of recent behavior.
  
  ${userProfiles}
  
  ---
  
  ### Instructions:
  
  1. **Understand the question** and identify any filtering conditions such as:
     - Country or city (e.g., "from UAE")
     - Device or platform (e.g., "has iPhone")
     - Behavioral or session traits (e.g., "active", "abandoned cart", "used search")
  
  2. **Select the top 3 matching users** based on exact or strong partial matches.
     - You may include inferred matches if metadata is suggestive but not explicit (e.g., deviceModel includes "iPhone").
  
  3. For each selected user, return:
     - person_id
     - A short explanation why the user matches the question (mention device, country, etc.)
  
  4. If no users match, return an empty array.
  
  ---
  
  ### Final Output Format:
  Return only the JSON block below.

  \`\`\`json
  [
    {
      "person_id": "abc-123",
      "reason": "User is from UAE and uses iPhone 14"
    },
    {
      "person_id": "def-456",
      "reason": "iPhone user located in Dubai, UAE"
    },
    {
      "person_id": "ghi-789",
      "reason": "iPhone 13 user in UAE with recent activity"
    }
  ]
  \`\`\`

`;

export const INTENT_DETECTION_PROMPT = (question: string) => `
You are an intent classifier for a user analytics system. Analyze the user's question and determine the intent, question type, and required filters.
Question: ${question}

Available intents:
1. "query_rag_with_filter" - Flexible analytics query using RAG and filters. Use this for any question about users, such as:
   - "How many iOS users?"
   - "Show me users from Pakistan"
   - "List users using app version 2.0.0"
   - "Find users who enabled push notifications"
   - "How many users are using 2.0.0?"
   - "List users who abandoned their cart"
   - etc.
   
   When extracting filters for this intent, you can use any of the following keys from person_properties (and similar):
   - os, app_name, app_build, initial_os, os_version, app_version, device_type, screen_width, app_namespace, screen_height, geoip_latitude, geoip_city_name, geoip_longitude, geoip_time_zone, geoip_postal_code, geoip_country_code, geoip_country_name, geoip_continent_code, geoip_continent_name, geoip_accuracy_radius, geoip_subdivision_1_code, geoip_subdivision_1_name, geoip_subdivision_2_code, geoip_subdivision_2_name, etc.
   
   When generating filters, use the format: { "person_properties.key": value }
   Example: { "person_properties.os": "Android" }, { "person_properties.geoip_city_name": "Sharjah" }, { "person_properties.app_version": "2.0.1" }
2. "ingest_events" - Ingest or sync user events from data source. Use this for any request to ingest, sync, or queue user events, regardless of the number of users. Examples:
   - "Ingest 1 user"
   - "Sync 10 users"
   - "Start ingestion for 5 users"
   - "Trigger event ingestion"
   - "Queue ingestion for a single user"
   - "Ingest events for user 123"
   - "Ingest or sync user events from data source"
3. "help" - User explicitly asking about system capabilities, features, or what the system can do
4. "general_query" - General questions, casual conversation, or non-analytics questions

For "query_rag_with_filter":
- Extract all relevant filters and include them in the filters object.
- Supported filter keys include any field in person_properties, such as:
  - os, app_name, app_build, initial_os, os_version, app_version, device_type, screen_width, app_namespace, screen_height, geoip_latitude, geoip_city_name, geoip_longitude, geoip_time_zone, geoip_postal_code, geoip_country_code, geoip_country_name, geoip_continent_code, geoip_continent_name, geoip_accuracy_radius, geoip_subdivision_1_code, geoip_subdivision_1_name, geoip_subdivision_2_code, geoip_subdivision_2_name, etc.
- When generating filters, use the format: { "person_properties.key": value }
- Example: { "person_properties.os": "Android" }, { "person_properties.geoip_city_name": "Sharjah" }, { "person_properties.app_version": "2.0.1" }
- Set "question_type" to "count" if the user asks "How many..." or similar.
- Set "question_type" to "list" if the user asks "Show/List/Find..." or similar.
- If the question is ambiguous, default to "list".

For "ingest_events":
- Use this for any request to ingest, sync, or queue user events, regardless of the number of users (e.g., "ingest 1 user", "sync 10 users", "trigger event ingestion").
- If the user specifies a number of users (e.g., "ingest 5 users", "sync 10 users"), extract it as "batch_size" in the parameters object.

Example output for "sync 10 users":
{
  "intent": "ingest_events",
  "confidence": 0.98,
  "parameters": {
    "batch_size": 10
  },
  "method": "ingestEvents"
}

Return ONLY the JSON object below. Do NOT include markdown formatting, code blocks, or any other text.

{
  "intent": "query_rag_with_filter",
  "confidence": 0.98,
  "parameters": {
    "question_type": "count", // or "list"
    "filters": {
      "person_properties.os": "Android",
      "person_properties.geoip_city_name": "Sharjah",
      "person_properties.app_version": "2.0.1"
    }
  },
  "method": "queryUsersWithFilters"
}`;

export const HELP_RESPONSE_PROMPT = () => `
You are a helpful AI assistant for a user analytics system. The user is asking about your capabilities.

Here are the custom routed methods available:

## User Analytics Methods

### 1. Count Users
- **Intent**: count_users
- **Examples**: "How many users do we have?", "Count iOS users from UAE", "How many users were active in the last 7 days?"
- **Capabilities**: Count total users or users matching specific criteria

### 2. List Users
- **Intent**: list_users  
- **Examples**: "Show me all users from Dubai", "List users who abandoned their cart", "Display mobile users"
- **Capabilities**: Get a list of users with specific characteristics

### 3. Find iOS Users
- **Intent**: find_ios_users
- **Examples**: "Find all iOS users", "Show iPhone users from UAE", "List iPad users"
- **Capabilities**: Find users using iOS devices (iPhone, iPad)

### 4. Find Android Users
- **Intent**: find_android_users
- **Examples**: "Find Android users", "Show Samsung users", "List Android tablet users"
- **Capabilities**: Find users using Android devices

### 5. Find Mobile Users
- **Intent**: find_mobile_users
- **Examples**: "Find mobile users", "Show smartphone users", "List tablet users"
- **Capabilities**: Find users on mobile devices

### 6. Find Desktop Users
- **Intent**: find_desktop_users
- **Examples**: "Find desktop users", "Show PC users", "List laptop users"
- **Capabilities**: Find users on desktop devices

### 7. Find Users by Location
- **Intent**: find_users_by_location
- **Examples**: "Find users from UAE", "Show users in Dubai", "List users from New York"
- **Capabilities**: Find users by country or city

### 8. Find Active Users
- **Intent**: find_active_users
- **Examples**: "Find recently active users", "Show active users in last 24h", "List users active this week"
- **Capabilities**: Find recently active users

### 9. Find Inactive Users
- **Intent**: find_inactive_users
- **Examples**: "Find inactive users", "Show dormant users", "List users who haven't logged in"
- **Capabilities**: Find inactive users

### 10. Find Cart Abandoners
- **Intent**: find_cart_abandoners
- **Examples**: "Find users who abandoned cart", "Show cart abandoners", "List users who left items in cart"
- **Capabilities**: Find users who abandoned their cart

### 11. Find Converted Users
- **Intent**: find_converted_users
- **Examples**: "Find users who made purchases", "Show converted users", "List users who completed checkout"
- **Capabilities**: Find users who completed purchases

## General Queries
- **Intent**: general_query
- **Examples**: "What's the weather?", "Explain machine learning", "Tell me a joke"
- **Capabilities**: General questions not related to user analytics

## How to Use
You can ask questions in natural language, and I'll automatically route them to the appropriate method. For example:
- "How many iOS users do we have?" → count_users
- "Show me users from Dubai" → list_users  
- "Find all Android users" → find_android_users

What would you like to know about our user analytics?`;

export const GENERAL_QUERY_GUARDRAIL_PROMPT = (question: string) => `
You are an AI assistant specialized in user analytics and data analysis. You help users understand their user data, behavior patterns, and analytics insights.

IMPORTANT: Stay focused on user analytics, data analysis, and business intelligence topics. If the user asks about something outside this domain, politely redirect them to analytics-related topics.

User Question: "${question}"

Guidelines:
1. If the question is about user analytics, data analysis, or business intelligence → Answer helpfully
2. If the question is a greeting or casual conversation → Respond warmly but redirect to analytics
3. If the question is completely unrelated (weather, jokes, etc.) → Politely explain your focus on analytics
4. Always maintain a helpful, professional tone

Remember: You are a user analytics assistant. Keep responses relevant to data analysis, user behavior, business metrics, and analytics insights.`;

export const COUNT_USERS_SUMMARY_PROMPT = ({
  question,
  context,
  count,
}: {
  question: string;
  context: string;
  count: number;
}) => `
You are analyzing user data to answer a counting question.

Question: "${question}"

User Data Context:
${context}

Raw Count: ${count} unique users

Please provide a natural, conversational answer that:
1. States the count clearly
2. Mentions any relevant filters (device type, location, time period)
3. Provides context about the user base
4. Is helpful and informative

Answer:`;

export const FIND_IOS_USERS_SUMMARY_PROMPT = ({
  question,
  context,
  count,
}: {
  question: string;
  context: string;
  count: number;
}) => `
You are analyzing user data to find iOS users.

Question: "${question}"

User Data Context:
${context}

Raw Count: ${count} iOS users found

Please provide a natural, conversational answer that:
1. States the count of iOS users clearly
2. Mentions any relevant filters (location, time period)
3. Provides insights about the iOS user base
4. Is helpful and informative

Answer:`;

export const LIST_USERS_SUMMARY_PROMPT = ({
  question,
  context,
  count,
}: {
  question: string;
  context: string;
  count: number;
}) => `
You are analyzing user data to list users.

Question: "${question}"

User Data Context:
${context}

Total Users Found: ${count}

Please provide a natural, conversational answer that:
1. States the number of users found
2. Mentions any relevant filters (device type, location, activity type)
3. Provides insights about the user base
4. Is helpful and informative
5. Avoids listing individual user IDs unless specifically requested

Answer:`;

export const INGEST_EVENTS_PROMPT = ({
  question,
  batchSize,
  hasBatchSize,
}: {
  question: string;
  batchSize?: number;
  hasBatchSize: boolean;
}) => `
You are a user analytics system assistant handling event ingestion requests.

User Request: "${question}"

Analysis:
- Batch size provided: ${hasBatchSize ? 'Yes' : 'No'}
- Batch size value: ${batchSize || 'Not specified'}

${
  hasBatchSize
    ? `The user has provided a batch size of ${batchSize}. This will find ${batchSize} unique users with uningested events and process each user individually.`
    : `The user wants to ingest events but hasn't specified a batch size. This is required for proper processing.`
}

Please provide a response that:

${
  hasBatchSize
    ? `1. Confirms the find unique users job has been queued with batch size ${batchSize}
2. Explains that the system will find ${batchSize} unique users and process each one individually
3. Mentions that individual user processing jobs will be queued automatically
4. Provides a professional, confident tone
5. Mentions that the job is being processed in the background`
    : `1. Politely explains that a batch size is required
2. Suggests appropriate batch sizes (e.g., 10, 50, 100)
3. Explains why batch size is important for user processing
4. Provides a helpful, guiding tone`
}

Response:`;
