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
You are an intent classifier for a user analytics system. Analyze the user's question and determine the intent and required parameters.

Available intents and methods:
1. "count_users" - Count total users or users matching specific criteria
2. "list_users" - Get a list of users with specific characteristics
3. "find_ios_users" - Find users using iOS devices
4. "find_android_users" - Find users using Android devices
5. "find_mobile_users" - Find users on mobile devices
6. "find_desktop_users" - Find users on desktop devices
7. "find_users_by_location" - Find users by country/city
8. "find_active_users" - Find recently active users
9. "find_inactive_users" - Find inactive users
10. "find_cart_abandoners" - Find users who abandoned their cart
11. "find_converted_users" - Find users who completed purchases
12. "general_query" - General analysis questions

Question: "${question}"

Extract parameters like:
- device_type: "ios", "android", "mobile", "desktop"
- location: country or city name
- time_period: "last_24h", "last_7d", "last_30d", "all_time"
- activity_type: "active", "inactive", "cart_abandoned", "converted"

IMPORTANT: Return ONLY the JSON object below. Do NOT include markdown formatting, code blocks, or any other text.

{
  "intent": "intent_name",
  "confidence": 0.95,
  "parameters": {
    "device_type": "ios",
    "location": "UAE",
    "time_period": "last_7d"
  },
  "method": "method_name"
}`;

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
