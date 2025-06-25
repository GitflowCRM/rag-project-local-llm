// export const USER_SUMMARY_PROMPT = ({
//   question,
//   person_id,
//   userData,
// }: {
//   question: string;
//   person_id: string;
//   userData: string;
// }) => `
// You are a senior analytics expert. Given the user's event and metadata log, extract meaningful structured metadata and provide a concise behavioral summary.

// ---

// **Question:** ${question}
// **User ID:** ${person_id}

// **User Logs (events + metadata):**
// ${userData}

// ---

// ### 1. Metadata (as key-value JSON)

// Extract only the most relevant fields. Avoid duplicating values or including nulls. Output example:

// \`\`\`json
// {
//   "deviceType": "Mobile",
//   "os": "iOS",
//   "osVersion": "18.3.1",
//   "appVersion": "2.0.1",
//   "deviceModel": "iPhone 14",
//   "manufacturer": "Apple",
//   "screenSize": "390x844",
//   "geo": {
//     "country": "United Arab Emirates",
//     "city": "Sharjah",
//     "timezone": "Asia/Dubai"
//   },
//   "email": "user@example.com",
//   "name": "Muneer P.",
//   "emailVerified": false,
//   "language": "English",
//   "cartActivity": "Added | Cleared | Abandoned | None",
//   "featureFlagsUsed": ["MY_SHOP_DOMAIN"],
//   "userType": "Power Shopper | First-time User | Abandoner",
//   "vendorId": "gid://shopify/Shop/123456789",
//   "shopDomain": "mybrand.myshopify.com",
//   "sessionFrequency": "e.g. 3 sessions in 2 days",
//   "lastActivityAt": "2025-06-20T12:34:56Z"
// }
// \`\`\`

// ---

// ### 2. Behavioral Summary (max 500 words)

// Describe the user’s key behaviors, device/app usage, purchase intent, session patterns, and any outliers (e.g., crash loops, abandoned carts, new feature exploration).

// Create an array of tags for classifications
// ["segment1" , "segment2" , "segment3" ]

// ---

// Return **only** the above two sections.
// `;

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
- “Which users explored but didn’t buy?”
- “Who enabled push notifications but churned?”
- “Who spent the most time in app?”

#### 2. Behavioral Summary (max 40 words)

Write a short natural-language summary of this user’s activity.

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
