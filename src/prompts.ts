export const USER_SUMMARY_PROMPT = (person_id: string, userData: string) => `
You are a senior analytics expert. Given the user's event and metadata log, you must extract **meaningful structured metadata** and provide a concise behavioral summary.

User ID: ${person_id}

User Event & Metadata Logs:
${userData}

---

### 1. Metadata (key-value JSON)

Extract all important metadata in this format:

\`\`\`json
{
  "deviceType": "Mobile | Tablet | Desktop",
  "os": "iOS | Android | Other",
  "osVersion": "e.g. 17.0",
  "appVersion": "e.g. 1.1.3",
  "deviceModel": "e.g. iPhone 14",
  "manufacturer": "e.g. Apple",
  "screenSize": "e.g. 1170x2532",
  "geo": {
    "country": "United Arab Emirates",
    "city": "Sharjah",
    "timezone": "Asia/Dubai"
  },
  "email": "user@example.com",
  "phone": "+971501234567",
  "name": "John Doe",
  "country": "United Arab Emirates",
  "city": "Sharjah",
  "timezone": "Asia/Dubai",
  "language": "English",
  "sessionFrequency": "e.g. 3 sessions in 2 days",
  "lastActivityAt": "ISO Timestamp",
  "cartActivity": "Added | Cleared | Abandoned | None",
  "featureFlagsUsed": ["MY_SHOP_DOMAIN", ...],
  "userType": "Power Shopper | Casual Browser | First-time User | Abandoner | Bug Tester",
  "shopDomain": "superhero-tshirts-store.myshopify.com",
  "vendorId": "gid://shopify/Shop/66829451403",
  "name": "muneer@gitspark.com",
  "email": "muneer@gitspark.com",
  "vendor": { "id": "gid://shopify/Shop/66829451403", "shopDomain": "" },
  "issuedAt": 1747408798858,
  "$app_name": "Appify.it Preview",
  "$app_build": "11",
  "$initial_os": "iOS",
  "$os_version": "18.3.1",
  "$app_version": "1.1.3",
  "$device_type": "Mobile",
  "$screen_width": 430,
  "emailVerified": false,
  "$app_namespace": "com.gitspark.appbuilder.vendor",
  "$screen_height": 932,
  "$geoip_latitude": 25.3412,
  "notification_id": "ccbfd7ff-092c-44c4-9c7b-8ef19c74319e",
  "oneSignalUserId": "ccbfd7ff-092c-44c4-9c7b-8ef19c74319e",
  "$geoip_city_name": "Sharjah",
  "$geoip_longitude": 55.4224,
  "$geoip_time_zone": "Asia/Dubai",
  "$initial_app_name": "Appify.it Preview",
  "$geoip_postal_code": null,
  "$initial_app_build": "11",
  "$creator_event_uuid": "0196d7d6-9129-73d6-8989-a04f82915609",
  "$geoip_country_code": "AE",
  "$geoip_country_name": "United Arab Emirates",
  "$initial_os_version": "18.3.1",
  "$initial_app_version": "1.1.3",
  "$initial_device_type": "Mobile",
  "$geoip_continent_code": "AS",
  "$geoip_continent_name": "Asia",
  "$initial_screen_width": 430,
  "$geoip_accuracy_radius": 20,
  "$geoip_city_confidence": null,
  "$initial_app_namespace": "com.gitspark.appbuilder.vendor",
  "$initial_screen_height": 932,
  "$initial_geoip_latitude": 25.3412,
  "$initial_geoip_city_name": "Sharjah",
  "$initial_geoip_longitude": 55.4224,
  "$initial_geoip_time_zone": "Asia/Dubai",
  "$geoip_subdivision_1_code": "SH",
  "$geoip_subdivision_1_name": "Sharjah",
  "$geoip_subdivision_2_code": null,
  "$geoip_subdivision_2_name": null,
  "$initial_geoip_postal_code": null,
  "$initial_geoip_country_code": "AE",
  "$initial_geoip_country_name": "United Arab Emirates",
  "$initial_geoip_continent_code": "AS",
  "$initial_geoip_continent_name": "Asia",
  "$initial_geoip_accuracy_radius": 20,
  "$initial_geoip_city_confidence": null,
  "$initial_geoip_subdivision_1_code": "SH",
  "$initial_geoip_subdivision_1_name": "Sharjah",
  "$initial_geoip_subdivision_2_code": null,
  "$initial_geoip_subdivision_2_name": null
}
\`\`\`

### 2. Behavioral Summary (under 500 words)

Write a natural language summary based on the above metadata and event sequence. Highlight the user’s primary intent, patterns, and any unique observations (e.g., crash loop, high cart churn, feature usage).

---

Return only these two sections: structured metadata and summary.`;
