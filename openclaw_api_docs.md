# OpenClaw API & Database Documentation

This document describes every webhook event that OpenClaw can send to the Hyphening Marketing Ops Center. Each event maps to a specific database operation. OpenClaw **must** use these exact JSON formats — any deviation will be silently rejected by the backend.

---

## 1. Webhook Endpoint & Authentication

* **Endpoint**: `POST /api/openclaw/webhook`
* **Authentication**: HMAC-SHA256 signature + timestamp + nonce (replay prevention)

### Required Request Headers

| Header | Description |
| :--- | :--- |
| `x-openclaw-signature` | Hex-encoded HMAC-SHA256 of the raw stringified JSON body, hashed with `process.env.OPENCLAW_HMAC_SECRET` |
| `x-openclaw-timestamp` | Current UTC ISO timestamp (must be within 5 minutes of server time) |
| `x-openclaw-nonce` | Unique string per request (prevents replay attacks) |

### Request Format

All requests must use this exact envelope:
```json
{
  "event_type": "<event_name>",
  "payload": { ... }
}
```

### Success Response
```json
{
  "status": "accepted",
  "event_type": "<event_name>"
}
```

---

## 2. Entity ID Reference

Before sending any webhook, OpenClaw must know the correct IDs. Use this reference:

| Entity | Where to Find IDs |
| :--- | :--- |
| Clients | `GET /api/clients` → `clients[].id` and `clients[].name` |
| Users (staff) | `GET /api/auth/users` → `users[].id`, `users[].name`, `users[].role` |
| Freelancers | `GET /api/freelancers` → `freelancers[].id` and `freelancers[].name` |
| Artists | `GET /api/artists` → `artists[].id` and `artists[].name` |
| Venues | `GET /api/artists/venues` → `venues[].id` and `venues[].name` |
| Tasks | `GET /api/tasks` → `tasks[].id` |
| Content | `GET /api/clients/:id/marketing/content` → `content[].id` |
| Ad Campaigns | `GET /api/clients/:id/marketing/ads` → `ads[].id` |
| Scripts | `GET /api/clients/:id/marketing/scripts` → `scripts[].id` |
| Monthly Reports | `GET /api/clients/:id/marketing/monthly` → `reports[].id` |
| Gigs | `GET /api/artists/gigs` → `gigs[].id` |
| Planning Cycles | `GET /api/artists/planning-cycles` → `cycles[].id` |

---

## 3. Webhook Event Reference

### A. Create Task (`create_task`)

Creates a new Kanban task.

```json
{
  "event_type": "create_task",
  "payload": {
    "title": "Edit Artisan Coffee Brand Reel",
    "description": "Cut intro to 3 seconds, align backing music beats with transitions.",
    "priority": "high",
    "task_type": "video",
    "client_id": 1,
    "assigned_to": 2,
    "due_date": "2026-07-15"
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `title` | String | ✅ Yes | Any text | — |
| `description` | String | No | Any text | `null` |
| `priority` | String | No | `low`, `medium`, `high`, `urgent` | `medium` |
| `task_type` | String | No | `video`, `graphic`, `social`, `other` | `other` |
| `client_id` | Integer | No | Valid `crm_clients.id` | `null` |
| `assigned_to` | Integer | No | Valid `users.id` | `null` |
| `due_date` | String | No | `YYYY-MM-DD` | `null` |

> **Note**: Status is automatically set to `todo`. A Telegram notification is sent to the admin on creation.

---

### B. Update Task (`update_task`)

Updates fields on an existing Kanban task.

```json
{
  "event_type": "update_task",
  "payload": {
    "task_id": 14,
    "status": "in_progress",
    "priority": "urgent",
    "description": "Emergency edit requested by client — rush delivery.",
    "assigned_to": 2
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `task_id` | Integer | ✅ Yes | Valid `kanban_tasks.id` | — |
| `status` | String | No | `backlog`, `todo`, `in_progress`, `review`, `revision`, `approved`, `delivered`, `cancelled` | — |
| `priority` | String | No | `low`, `medium`, `high`, `urgent` | — |
| `description` | String | No | Any text | — |
| `assigned_to` | Integer | No | Valid `users.id` | — |

> **Note**: Status transitions are enforced via a state machine. Invalid transitions will fail silently. See the status transition rules below.

**Status Transition Rules**:
| From | Allowed To |
| :--- | :--- |
| `backlog` | `todo`, `cancelled` |
| `todo` | `in_progress`, `backlog`, `cancelled` |
| `in_progress` | `review`, `todo`, `cancelled` |
| `review` | `approved`, `revision`, `in_progress` |
| `revision` | `in_progress`, `cancelled` |
| `approved` | `delivered` |
| `delivered` | *(terminal — no further transitions)* |
| `cancelled` | `backlog` |

---

### C. Create Content (`create_content`)

Creates a new entry in the marketing content tracker (content plan / post).

```json
{
  "event_type": "create_content",
  "payload": {
    "client_id": 1,
    "platform": "instagram",
    "date": "2026-07-20",
    "post_type": "Reel",
    "title": "Summer Collection Launch Reel",
    "script": "Hook: 'You won't believe this transformation...' → Product reveal → CTA",
    "caption": "Summer is HERE 🌴 Our new collection just dropped. Link in bio!",
    "link": "https://www.instagram.com/reel/example",
    "time": "18:30",
    "status": "Draft",
    "boosted": "No",
    "views": 0,
    "likes": 0,
    "comments": 0,
    "shares": 0,
    "saves": 0,
    "follows": 0,
    "avg_watch_time_pct": null,
    "youtube_views": 0,
    "youtube_watch_time": 0.0,
    "youtube_avg_view_duration": null,
    "youtube_ctr": 0.0,
    "script_id": null
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `client_id` | Integer | ✅ Yes | Valid `crm_clients.id` | — |
| `platform` | String | No | `instagram`, `youtube` | `null` |
| `date` | String | No | `YYYY-MM-DD` | `null` |
| `post_type` | String | No | `Story`, `Static`, `Carousel`, `Reel`, `Youtube`, `Short` | `null` |
| `title` | String | No | Any text (auto-generated from script/caption if omitted) | Auto |
| `script` | String | No | Script/hook text | `null` |
| `caption` | String | No | Post caption text | `null` |
| `link` | String | No | URL to the post | `null` |
| `time` | String | No | Posting time `HH:MM` | `null` |
| `status` | String | No | `Draft`, `Pending`, `Posted` | `Draft` |
| `boosted` | String | No | `Yes`, `No`, or `Yes ₹500` style | `No` |
| `views` | Integer | No | — | `0` |
| `likes` | Integer | No | — | `0` |
| `comments` | Integer | No | — | `0` |
| `shares` | Integer | No | — | `0` |
| `saves` | Integer | No | — | `0` |
| `follows` | Integer | No | — | `0` |
| `avg_watch_time_pct` | Float | No | 0–100 | `null` |
| `youtube_views` | Integer | No | — | `0` |
| `youtube_watch_time` | Float | No | Hours | `0.0` |
| `youtube_avg_view_duration` | String | No | e.g. `"3:42"` | `null` |
| `youtube_ctr` | Float | No | Percentage | `0.0` |
| `script_id` | Integer | No | Valid `marketing_scripts.id` | `null` |

> **Auto-computed fields** (do NOT send these — the backend calculates them):
> `engagement_rate_pct`, `save_rate_pct`, `content_score`, `skip_rate_pct`

---

### D. Update Content (`update_content`)

Updates an existing content tracker row.

```json
{
  "event_type": "update_content",
  "payload": {
    "client_id": 1,
    "content_id": 42,
    "status": "Posted",
    "views": 15200,
    "likes": 890,
    "comments": 45,
    "shares": 120,
    "saves": 340,
    "avg_watch_time_pct": 72.5,
    "link": "https://www.instagram.com/reel/actual-post-link"
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `client_id` | Integer | ✅ Yes | Valid `crm_clients.id` | — |
| `content_id` | Integer | ✅ Yes | Valid `marketing_content_tracker.id` | — |
| `platform` | String | No | `instagram`, `youtube` | — |
| `date` | String | No | `YYYY-MM-DD` | — |
| `post_type` | String | No | `Story`, `Static`, `Carousel`, `Reel`, `Youtube`, `Short` | — |
| `title` | String | No | Any text | — |
| `script` | String | No | Script text | — |
| `caption` | String | No | Caption text | — |
| `link` | String | No | URL | — |
| `time` | String | No | `HH:MM` | — |
| `status` | String | No | `Draft`, `Pending`, `Posted` | — |
| `boosted` | String | No | — | — |
| `views` | Integer | No | — | — |
| `likes` | Integer | No | — | — |
| `comments` | Integer | No | — | — |
| `shares` | Integer | No | — | — |
| `saves` | Integer | No | — | — |
| `follows` | Integer | No | — | — |
| `avg_watch_time_pct` | Float | No | — | — |
| `youtube_views` | Integer | No | — | — |
| `youtube_watch_time` | Float | No | — | — |
| `youtube_avg_view_duration` | String | No | — | — |
| `youtube_ctr` | Float | No | — | — |
| `script_id` | Integer | No | Valid `marketing_scripts.id` or `null` | — |

> **Auto-computed on update**: `engagement_rate_pct`, `save_rate_pct`, `content_score`

---

### E. Create Ad Campaign (`create_ad_campaign`)

```json
{
  "event_type": "create_ad_campaign",
  "payload": {
    "client_id": 1,
    "platform": "Meta",
    "ad_campaign_name": "Summer Sale 2026 - Lookalike",
    "leads": 45,
    "total_ad_spend_inr": 25000,
    "impressions": 120000,
    "clicks": 3200,
    "revenue_generated": 85000
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `client_id` | Integer | ✅ Yes | Valid `crm_clients.id` | — |
| `platform` | String | No | `YouTube`, `Meta`, `Google` | `null` |
| `ad_campaign_name` | String | No | Any text | `null` |
| `leads` | Integer | No | — | `0` |
| `total_ad_spend_inr` | Float | No | Amount in ₹ | `0` |
| `impressions` | Integer | No | — | `0` |
| `clicks` | Integer | No | — | `0` |
| `revenue_generated` | Float | No | Amount in ₹ | `0` |

> **Auto-computed**: `ctr_pct`, `cpc_inr`, `cpl_inr`, `roas`

---

### F. Update Ad Campaign (`update_ad_campaign`)

```json
{
  "event_type": "update_ad_campaign",
  "payload": {
    "client_id": 1,
    "ad_id": 5,
    "leads": 72,
    "total_ad_spend_inr": 35000,
    "impressions": 180000,
    "clicks": 4800,
    "revenue_generated": 120000
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `client_id` | Integer | ✅ Yes | Valid `crm_clients.id` | — |
| `ad_id` | Integer | ✅ Yes | Valid `marketing_ad_campaigns.id` | — |
| `platform` | String | No | `YouTube`, `Meta`, `Google` | — |
| `ad_campaign_name` | String | No | — | — |
| `leads` | Integer | No | — | — |
| `total_ad_spend_inr` | Float | No | — | — |
| `impressions` | Integer | No | — | — |
| `clicks` | Integer | No | — | — |
| `revenue_generated` | Float | No | — | — |

> **Auto-recomputed on update**: `ctr_pct`, `cpc_inr`, `cpl_inr`, `roas`

---

### G. Upsert Monthly Report (`upsert_monthly_report`)

Creates or updates a monthly SEO/GMB performance report. If a report for the same `client_id` + `month` already exists, it is updated. MoM growth is auto-computed against the previous month.

```json
{
  "event_type": "upsert_monthly_report",
  "payload": {
    "client_id": 1,
    "month": "2026-06",
    "website_clicks": "1200",
    "website_traffic": 8500,
    "gmb_views": 3200,
    "map_views": 1800,
    "gmb_clicks": 450,
    "on_page_score": "85/100",
    "off_page": 12,
    "blogs": 4,
    "calls": 120,
    "directions": 85,
    "reviews": 8,
    "avg_rating": 4.6,
    "top_keywords": "best coffee shop mumbai, artisan cafe near me",
    "da": 32,
    "ai_overview_visible": "Yes"
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `client_id` | Integer | ✅ Yes | Valid `crm_clients.id` | — |
| `month` | String | ✅ Yes | `YYYY-MM` format | — |
| `website_clicks` | String | No | — | `null` |
| `website_traffic` | Integer | No | — | `null` |
| `gmb_views` | Integer | No | — | `null` |
| `map_views` | Integer | No | — | `null` |
| `gmb_clicks` | Integer | No | — | `null` |
| `on_page_score` | String | No | e.g. `"85/100"` | `null` |
| `off_page` | Integer | No | Backlinks count | `null` |
| `blogs` | Integer | No | — | `null` |
| `calls` | Integer | No | — | `null` |
| `directions` | Integer | No | — | `null` |
| `reviews` | Integer | No | — | `null` |
| `avg_rating` | Float | No | 1.0–5.0 | `null` |
| `top_keywords` | String | No | Comma-separated | `null` |
| `da` | Integer | No | Domain Authority | `null` |
| `ai_overview_visible` | String | No | `Yes`, `No` | `No` |

> **Auto-computed**: `mom_growth_sessions`, `mom_growth_gmb_views` (vs. previous month)

---

### H. Create Script (`create_script`)

Creates a new marketing script entry.

```json
{
  "event_type": "create_script",
  "payload": {
    "client_id": 1,
    "month": "2026-07",
    "title": "Why Local Coffee Beats Starbucks",
    "script_text": "Hook (0-2s): 'Starbucks fans look away...'\nBody: Compare artisan roasting process...\nCTA: Follow for more local food gems.",
    "reference_video_link": "https://www.instagram.com/reel/reference123",
    "reaction_video_link": null,
    "format": "reel"
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `client_id` | Integer | ✅ Yes | Valid `crm_clients.id` | — |
| `month` | String | ✅ Yes | `YYYY-MM` format | — |
| `title` | String | ✅ Yes | Any text | — |
| `script_text` | String | ✅ Yes | Full script content | — |
| `reference_video_link` | String | No | URL | `null` |
| `reaction_video_link` | String | No | URL | `null` |
| `format` | String | No | `reel`, `long_format` | `reel` |

---

### I. Update Script (`update_script`)

```json
{
  "event_type": "update_script",
  "payload": {
    "client_id": 1,
    "script_id": 8,
    "title": "Updated: Why Local Coffee Beats Starbucks",
    "script_text": "Hook (0-1.5s): 'POV: You tried local coffee for the first time...'"
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `client_id` | Integer | ✅ Yes | Valid `crm_clients.id` | — |
| `script_id` | Integer | ✅ Yes | Valid `marketing_scripts.id` | — |
| `title` | String | No | — | — |
| `script_text` | String | No | — | — |
| `month` | String | No | `YYYY-MM` | — |
| `reference_video_link` | String | No | URL | — |
| `reaction_video_link` | String | No | URL | — |
| `format` | String | No | `reel`, `long_format` | — |

---

### J. Create Client (`create_client`)

Adds a new CRM client.

```json
{
  "event_type": "create_client",
  "payload": {
    "name": "Mumbai Artisan Bakery",
    "client_type": "marketing",
    "contact_person": "Rahul Sharma",
    "contact_email": "rahul@artisanbakery.in",
    "contact_phone": "+91-9876543210",
    "calendar_sync_link": "https://calendar.google.com/...",
    "drive_folder_link": "https://drive.google.com/...",
    "instagram_business_account_id": "17841405793...",
    "youtube_channel_id": "UC...",
    "google_ads_customer_id": "123-456-7890"
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `name` | String | ✅ Yes | Any text | — |
| `client_type` | String | No | `marketing`, `artist_curation`, `both` | `marketing` |
| `contact_person` | String | No | — | `null` |
| `contact_email` | String | No | — | `null` |
| `contact_phone` | String | No | — | `null` |
| `calendar_sync_link` | String | No | URL | `null` |
| `drive_folder_link` | String | No | URL | `null` |
| `instagram_business_account_id` | String | No | — | `null` |
| `youtube_channel_id` | String | No | — | `null` |
| `google_ads_customer_id` | String | No | — | `null` |

> **Note**: API tokens (Instagram access token, YouTube API key) should NOT be sent via OpenClaw for security reasons. Set those manually in the dashboard.

---

### K. Update Client (`update_client`)

```json
{
  "event_type": "update_client",
  "payload": {
    "client_id": 1,
    "contact_person": "Priya Sharma",
    "contact_email": "priya@artisanbakery.in",
    "is_active": 1
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `client_id` | Integer | ✅ Yes | Valid `crm_clients.id` | — |
| `name` | String | No | — | — |
| `client_type` | String | No | `marketing`, `artist_curation`, `both` | — |
| `contact_person` | String | No | — | — |
| `contact_email` | String | No | — | — |
| `contact_phone` | String | No | — | — |
| `calendar_sync_link` | String | No | URL | — |
| `drive_folder_link` | String | No | URL | — |
| `instagram_business_account_id` | String | No | — | — |
| `youtube_channel_id` | String | No | — | — |
| `google_ads_customer_id` | String | No | — | — |
| `is_active` | Integer | No | `0` or `1` | — |
| `portal_enabled` | Integer | No | `0` or `1` | — |

---

### L. Create Artist (`create_artist`)

Adds a new artist to the curation roster.

```json
{
  "event_type": "create_artist",
  "payload": {
    "name": "Arjun Menon",
    "category": "Vocalist",
    "city": "Mumbai",
    "phone": "+91-9876543210",
    "email": "arjun@example.com",
    "telegram_chat_id": "123456789",
    "instruments": "Vocals, Guitar",
    "insta_link": "https://instagram.com/arjunmenon",
    "description": "Indie vocalist specializing in acoustic sets and Bollywood covers.",
    "rating": 4,
    "notes": "Prefers evening slots. Needs mic + monitor."
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `name` | String | ✅ Yes | Any text | — |
| `category` | String | No | e.g. `Vocalist`, `Band`, `DJ`, `Instrumentalist` | `null` |
| `city` | String | No | — | `null` |
| `phone` | String | No | — | `null` |
| `email` | String | No | — | `null` |
| `telegram_chat_id` | String | No | Telegram numeric chat ID | `null` |
| `instruments` | String | No | Comma-separated | `null` |
| `insta_link` | String | No | URL | `null` |
| `description` | String | No | — | `null` |
| `rating` | Integer | No | 1–5 | `null` |
| `notes` | String | No | Internal notes | `null` |

> **Auto-generated**: `artist_id` (from name + phone). **Auto-computed rollups**: `total_performances`, `average_fee_inr`, `total_amount_paid_inr`, `payment_status`, `reliability_score`.

---

### M. Update Artist (`update_artist`)

```json
{
  "event_type": "update_artist",
  "payload": {
    "artist_id": 3,
    "category": "Band",
    "rating": 5,
    "notes": "Excellent crowd engagement. Book for premium venues."
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `artist_id` | Integer | ✅ Yes | Valid `artists.id` | — |
| `name` | String | No | — | — |
| `category` | String | No | — | — |
| `city` | String | No | — | — |
| `phone` | String | No | — | — |
| `email` | String | No | — | — |
| `telegram_chat_id` | String | No | — | — |
| `is_active` | Integer | No | `0` or `1` | — |
| `instruments` | String | No | — | — |
| `insta_link` | String | No | — | — |
| `description` | String | No | — | — |
| `rating` | Integer | No | 1–5 | — |
| `notes` | String | No | — | — |

---

### N. Create Venue (`create_venue`)

```json
{
  "event_type": "create_venue",
  "payload": {
    "name": "The Blue Frog Lounge",
    "address": "Mathuradas Mill Compound, Lower Parel, Mumbai",
    "city": "Mumbai",
    "map_link": "https://maps.google.com/?q=...",
    "poc_name": "Vikram",
    "poc_phone": "+91-9876543210",
    "poc_email": "vikram@bluefrog.in",
    "social_links": "https://instagram.com/bluefrogmumbai",
    "gig_confirmed_message": "Your gig at {{venue_name}} on {{gig_date}} is confirmed! Address: {{address}}. Maps: {{map_link}}",
    "client_id": 2
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `name` | String | ✅ Yes | Any text | — |
| `address` | String | No | — | `null` |
| `city` | String | No | — | `null` |
| `map_link` | String | No | URL | `null` |
| `poc_name` | String | No | Point of contact name | `null` |
| `poc_phone` | String | No | — | `null` |
| `poc_email` | String | No | — | `null` |
| `social_links` | String | No | — | `null` |
| `gig_confirmed_message` | String | No | Template with `{{venue_name}}`, `{{gig_date}}`, `{{address}}`, `{{map_link}}` | `null` |
| `client_id` | Integer | No | Valid `crm_clients.id` | `null` |

---

### O. Update Venue (`update_venue`)

```json
{
  "event_type": "update_venue",
  "payload": {
    "venue_id": 2,
    "poc_name": "Neha",
    "poc_phone": "+91-9123456789"
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `venue_id` | Integer | ✅ Yes | Valid `venues.id` | — |
| `name` | String | No | — | — |
| `address` | String | No | — | — |
| `city` | String | No | — | — |
| `map_link` | String | No | — | — |
| `poc_name` | String | No | — | — |
| `poc_phone` | String | No | — | — |
| `poc_email` | String | No | — | — |
| `social_links` | String | No | — | — |
| `gig_confirmed_message` | String | No | — | — |
| `client_id` | Integer | No | — | — |

---

### P. Create Gig (`create_gig`)

Schedules a new gig for an artist.

```json
{
  "event_type": "create_gig",
  "payload": {
    "artist_id": 3,
    "venue_id": 2,
    "planning_cycle_id": null,
    "gig_date": "2026-08-15",
    "fee_inr": 15000,
    "advance_paid": 5000,
    "status": "Confirmed"
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `artist_id` | Integer | ✅ Yes | Valid `artists.id` | — |
| `gig_date` | String | ✅ Yes | `YYYY-MM-DD` | — |
| `venue_id` | Integer | No | Valid `venues.id` | `null` |
| `planning_cycle_id` | Integer | No | Valid `artist_planning_cycles.id` | `null` |
| `fee_inr` | Float | No | Amount in ₹ | `0` |
| `advance_paid` | Float | No | Amount in ₹ | `0` |
| `status` | String | No | `Paid`, `Pending`, `Advance Paid`, `Cancelled`, `Hold`, `Confirmed` | `Pending` |

> **Side effect**: Artist rollups (`total_performances`, `average_fee_inr`, etc.) are automatically recalculated.

---

### Q. Update Gig (`update_gig`)

```json
{
  "event_type": "update_gig",
  "payload": {
    "gig_id": 5,
    "status": "Paid",
    "fee_inr": 18000
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `gig_id` | Integer | ✅ Yes | Valid `gig_status.id` | — |
| `status` | String | No | `Paid`, `Pending`, `Advance Paid`, `Cancelled`, `Hold`, `Confirmed` | — |
| `fee_inr` | Float | No | — | — |
| `advance_paid` | Float | No | — | — |
| `gig_date` | String | No | `YYYY-MM-DD` | — |
| `venue_id` | Integer | No | — | — |
| `artist_id` | Integer | No | — | — |

> **Side effect**: Artist rollups are recalculated for both old and new artist (if artist_id changes).

---

### R. Create Freelancer (`create_freelancer`)

```json
{
  "event_type": "create_freelancer",
  "payload": {
    "name": "Rohan Kapoor",
    "email": "rohan@editstudio.com",
    "phone": "+91-9876543210",
    "company_name": "EditStudio Pro",
    "specialization": "Motion Graphics",
    "rate_per_video": 3500
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `name` | String | ✅ Yes | Any text | — |
| `email` | String | No | — | `null` |
| `phone` | String | No | — | `null` |
| `company_name` | String | No | — | `null` |
| `specialization` | String | No | Free text | `null` |
| `rate_per_video` | Float | No | Amount in ₹ | `null` |

---

### S. Update Freelancer (`update_freelancer`)

```json
{
  "event_type": "update_freelancer",
  "payload": {
    "freelancer_id": 3,
    "rate_per_video": 4000,
    "is_active": 1
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `freelancer_id` | Integer | ✅ Yes | Valid `freelancers.id` | — |
| `name` | String | No | — | — |
| `email` | String | No | — | — |
| `phone` | String | No | — | — |
| `company_name` | String | No | — | — |
| `specialization` | String | No | — | — |
| `rate_per_video` | Float | No | — | — |
| `is_active` | Integer | No | `0` or `1` | — |

---

### T. Send Chat Message (`send_chat_message`)

Sends an internal chat message for a specific client thread.

```json
{
  "event_type": "send_chat_message",
  "payload": {
    "client_id": 1,
    "message": "Content plan for July has been uploaded. Please review the scripts and confirm by Friday."
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `client_id` | Integer | ✅ Yes | Valid `crm_clients.id` | — |
| `message` | String | ✅ Yes | Any text | — |

> **Note**: The `sender_name` will be set to `"OpenClaw"` and `sender_id` to `0` (system).

---

### U. Update Knowledge (`update_knowledge`)

Stores or updates an operational knowledge entry (key-value JSON store).

```json
{
  "event_type": "update_knowledge",
  "payload": {
    "key": "video_style_guide_artisan",
    "knowledge_type": "template",
    "content": {
      "aspect_ratio": "9:16",
      "font": "Inter Bold",
      "caption_style": "Karaoke-highlight yellow",
      "preferred_music_genres": ["Jazz", "Lofi"]
    }
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `key` | String | ✅ Yes | Unique lookup key | — |
| `knowledge_type` | String | No | `general`, `context`, `template`, `scripting_guideline`, `editor_speed`, `client_tone_preference` | `general` |
| `content` | Object | ✅ Yes | Any JSON object | — |

> **Upsert behavior**: If the `key` already exists, the entry is updated. Otherwise, a new entry is created.

---

### V. Optimize Queue (`optimize_queue`)

Reserved for task queue reordering.

```json
{
  "event_type": "optimize_queue",
  "payload": {
    "task_order": [
      { "task_id": 12, "priority": "urgent" },
      { "task_id": 19, "priority": "high" },
      { "task_id": 7, "priority": "medium" }
    ]
  }
}
```

| Parameter | Type | Required | Allowed Values | Default |
| :--- | :--- | :--- | :--- | :--- |
| `task_order` | Array | No | Array of `{task_id, priority}` objects | — |

---

## 4. Complete Database Schema Reference

### `users`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `email` | TEXT UNIQUE | Not null |
| `password_hash` | TEXT | Not null |
| `name` | TEXT | Not null |
| `role` | TEXT | `super_admin`, `admin`, `ops_video_editor`, `ops_social_media_manager` |
| `is_active` | INTEGER | Default: 1 |

### `crm_clients`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT | Not null |
| `client_type` | TEXT | `marketing`, `artist_curation`, `both` |
| `contact_person` | TEXT | — |
| `contact_email` | TEXT | — |
| `contact_phone` | TEXT | — |
| `calendar_sync_link` | TEXT | — |
| `drive_folder_link` | TEXT | — |
| `instagram_access_token_enc` | TEXT | Encrypted — do not set via webhook |
| `instagram_business_account_id` | TEXT | — |
| `youtube_channel_id` | TEXT | — |
| `youtube_api_key_enc` | TEXT | Encrypted — do not set via webhook |
| `google_ads_customer_id` | TEXT | — |
| `api_status` | TEXT | `active`, `warning`, `error` |
| `portal_token` | TEXT UNIQUE | — |
| `portal_enabled` | INTEGER | — |
| `is_active` | INTEGER | — |

### `kanban_tasks`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `client_id` | INTEGER FK | → `crm_clients.id` |
| `title` | TEXT | Not null |
| `description` | TEXT | — |
| `status` | TEXT | `backlog`, `todo`, `in_progress`, `review`, `revision`, `approved`, `delivered`, `cancelled` |
| `priority` | TEXT | `low`, `medium`, `high`, `urgent` |
| `task_type` | TEXT | `video`, `graphic`, `social`, `other` |
| `assigned_to` | INTEGER FK | → `users.id` |
| `due_date` | TEXT | — |
| `completed_at` | TEXT | — |
| `revision_count` | INTEGER | Default: 0 |
| `max_revisions` | INTEGER | Default: 3 |
| `drive_link` | TEXT | — |
| `created_by` | INTEGER FK | → `users.id` |

### `marketing_content_tracker`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `client_id` | INTEGER FK | → `crm_clients.id` |
| `platform` | TEXT | `instagram`, `youtube` |
| `date` | TEXT | `YYYY-MM-DD` |
| `post_type` | TEXT | `Story`, `Static`, `Carousel`, `Reel`, `Youtube`, `Short` |
| `title` | TEXT | — |
| `script` | TEXT | — |
| `status` | TEXT | `Draft`, `Pending`, `Posted`, `Pending Client Approval`, `Client Approved`, `Client Rejected` |
| `link` | TEXT | — |
| `time` | TEXT | — |
| `caption` | TEXT | — |
| `views`, `likes`, `comments`, `shares`, `saves` | INTEGER | — |
| `follows` | INTEGER | Default: 0 |
| `avg_watch_time_pct` | REAL | — |
| `engagement_rate_pct` | REAL | Auto-computed |
| `save_rate_pct` | REAL | Auto-computed |
| `content_score` | REAL | Auto-computed |
| `boosted` | TEXT | — |
| `youtube_views` | INTEGER | Default: 0 |
| `youtube_watch_time` | REAL | Default: 0.0 |
| `youtube_avg_view_duration` | TEXT | — |
| `youtube_ctr` | REAL | Default: 0.0 |
| `kanban_task_id` | INTEGER FK | → `kanban_tasks.id` |
| `source` | TEXT | `manual`, `api_discovered`, `migration` |

### `marketing_scripts`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `client_id` | INTEGER FK | → `crm_clients.id` |
| `month` | TEXT | `YYYY-MM` |
| `title` | TEXT | Not null |
| `script_text` | TEXT | Not null |
| `reference_video_link` | TEXT | — |
| `reaction_video_link` | TEXT | — |
| `format` | TEXT | `reel`, `long_format`. Default: `reel` |

### `marketing_ad_campaigns`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `client_id` | INTEGER FK | → `crm_clients.id` |
| `platform` | TEXT | `YouTube`, `Meta`, `Google` |
| `ad_campaign_name` | TEXT | — |
| `leads` | INTEGER | — |
| `total_ad_spend_inr` | REAL | — |
| `impressions`, `clicks` | INTEGER | — |
| `ctr_pct`, `cpc_inr`, `cpl_inr`, `roas` | REAL | Auto-computed |
| `revenue_generated` | REAL | — |

### `marketing_monthly_report`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `client_id` | INTEGER FK | → `crm_clients.id` |
| `month` | TEXT | `YYYY-MM` |
| `website_clicks` | TEXT | — |
| `website_traffic` | INTEGER | — |
| `gmb_views`, `map_views`, `gmb_clicks` | INTEGER | — |
| `on_page_score` | TEXT | — |
| `off_page`, `blogs`, `calls`, `directions`, `reviews` | INTEGER | — |
| `avg_rating` | REAL | — |
| `top_keywords` | TEXT | — |
| `da` | INTEGER | — |
| `mom_growth_sessions`, `mom_growth_gmb_views` | REAL | Auto-computed |
| `ai_overview_visible` | TEXT | `Yes`, `No` |

### `artists`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `artist_id` | TEXT UNIQUE | Auto-generated code |
| `name` | TEXT | Not null |
| `category`, `city`, `phone`, `email` | TEXT | — |
| `telegram_chat_id` | TEXT | — |
| `bank_details_enc` | TEXT | Encrypted — do not set via webhook |
| `instruments`, `insta_link`, `description` | TEXT | — |
| `rating` | INTEGER | — |
| `notes` | TEXT | — |
| `is_active` | INTEGER | Default: 1 |
| `total_performances` | INTEGER | Auto-computed |
| `average_fee_inr` | REAL | Auto-computed |
| `total_amount_paid_inr` | REAL | Auto-computed |
| `payment_status` | TEXT | Auto-computed |
| `reliability_score` | REAL | Auto-computed |

### `gig_status`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `client_id` | INTEGER FK | → `crm_clients.id` |
| `artist_id` | INTEGER FK | → `artists.id` |
| `venue_id` | INTEGER FK | → `venues.id` |
| `planning_cycle_id` | INTEGER FK | → `artist_planning_cycles.id` |
| `gig_date` | TEXT | Not null |
| `fee_inr`, `advance_paid` | REAL | — |
| `status` | TEXT | `Paid`, `Pending`, `Advance Paid`, `Cancelled`, `Hold`, `Confirmed` |

### `venues`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `client_id` | INTEGER FK | → `crm_clients.id` |
| `name` | TEXT | Not null |
| `address`, `city`, `map_link` | TEXT | — |
| `poc_name`, `poc_phone`, `poc_email` | TEXT | — |
| `social_links` | TEXT | — |
| `gig_confirmed_message` | TEXT | Template with `{{}}` variables |

### `freelancers`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT | Not null |
| `email`, `phone` | TEXT | — |
| `telegram_chat_id` | TEXT | — |
| `specialization` | TEXT | — |
| `rate_per_video` | REAL | — |
| `is_active` | INTEGER | Default: 1 |
| `company_name` | TEXT | — |

### `openclaw_operational_knowledge`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `key` | TEXT UNIQUE | Not null |
| `knowledge_type` | TEXT | Not null |
| `content` | TEXT | JSON string |

### `internal_chat_messages`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `client_id` | INTEGER FK | → `crm_clients.id` |
| `sender_id` | INTEGER FK | → `users.id` |
| `sender_name` | TEXT | Not null |
| `message` | TEXT | Not null |

### `audit_logs`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `actor_id` | INTEGER FK | → `users.id` |
| `actor_email` | TEXT | — |
| `action` | TEXT | Not null |
| `entity_type` | TEXT | Not null |
| `entity_id` | INTEGER | — |
| `diff` | TEXT | JSON of changes |
| `ip_address` | TEXT | — |

### `openclaw_pending_actions`
| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | INTEGER PK | Auto-increment |
| `action_id` | TEXT UNIQUE | UUID for Telegram callback |
| `event_type` | TEXT | The webhook event type |
| `payload` | TEXT | JSON stringified payload |
| `status` | TEXT | `pending`, `accepted`, `rejected` |
| `telegram_message_id` | TEXT | Telegram message ID for editing |
| `created_at` | TEXT | ISO timestamp |
| `resolved_at` | TEXT | ISO timestamp |
