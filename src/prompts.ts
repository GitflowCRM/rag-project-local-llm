export const USER_SUMMARY_PROMPT = ({
  question,
  person_id,
  userData,
}: {
  question: string;
  person_id: string;
  userData: string;
}) => `
You are a senior analytics expert. Given the user's event and metadata log, extract meaningful structured metadata and provide a concise behavioral summary.

---

**Question:** ${question}  
**User ID:** ${person_id}

**User Logs (events + metadata):**  
${userData}

---

### 1. Metadata (as key-value JSON)

Extract only the most relevant fields. Avoid duplicating values or including nulls. Output example:

\`\`\`json
{
  "deviceType": "Mobile",
  "os": "iOS",
  "osVersion": "18.3.1",
  "appVersion": "2.0.1",
  "deviceModel": "iPhone 14",
  "manufacturer": "Apple",
  "screenSize": "390x844",
  "geo": {
    "country": "United Arab Emirates",
    "city": "Sharjah",
    "timezone": "Asia/Dubai"
  },
  "email": "user@example.com",
  "name": "Muneer P.",
  "emailVerified": false,
  "language": "English",
  "cartActivity": "Added | Cleared | Abandoned | None",
  "featureFlagsUsed": ["MY_SHOP_DOMAIN"],
  "userType": "Power Shopper | First-time User | Abandoner",
  "vendorId": "gid://shopify/Shop/123456789",
  "shopDomain": "mybrand.myshopify.com",
  "sessionFrequency": "e.g. 3 sessions in 2 days",
  "lastActivityAt": "2025-06-20T12:34:56Z"
}
\`\`\`

---

### 2. Behavioral Summary (max 500 words)

Describe the user’s key behaviors, device/app usage, purchase intent, session patterns, and any outliers (e.g., crash loops, abandoned carts, new feature exploration).

---

Return **only** the above two sections.
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
