# OpenClaw API & Database Documentation

This document describes the SQLite database schema and the JSON payload formats for sending data to the application via the **OpenClaw webhook API**.

---

## 1. OpenClaw Webhook Endpoint

OpenClaw integrations submit actions via the following endpoint:

* **Endpoint**: `POST http://localhost:3000/api/openclaw/webhook`
* **Authentication**: Requires HMAC-SHA256 signature verification.

### Required Request Headers

| Header | Description |
| :--- | :--- |
| `x-openclaw-signature` | Hex-encoded HMAC-SHA256 signature of the raw stringified JSON request body, hashed with `process.env.OPENCLAW_HMAC_SECRET`. |
| `x-openclaw-timestamp` | The current UTC ISO timestamp (used to prevent replay attacks). |
| `x-openclaw-nonce` | A unique string identifier for this request (used to prevent replay attacks). |

### Request Format
All requests must use a JSON body with an `event_type` and a corresponding `payload`:
```json
{
  "event_type": "string",
  "payload": {}
}
```

---

## 2. Webhook Event JSON Formats

### A. Create a Kanban Task (`create_task`)
Creates a new task in the Kanban flow.

* **JSON Body**:
```json
{
  "event_type": "create_task",
  "payload": {
    "title": "Edits for Artisan Coffee Reel",
    "description": "Cut the intro scene to 3 seconds and align backing music beats.",
    "priority": "high",
    "task_type": "video",
    "client_id": 1
  }
}
```
* **Parameters**:
  - `title` *(String, Required)*: The headline of the task.
  - `description` *(String, Optional)*: Detailed task requirements.
  - `priority` *(String, Optional)*: One of `low`, `medium`, `high`, `urgent` (Default: `medium`).
  - `task_type` *(String, Optional)*: One of `video`, `graphic`, `social`, `other` (Default: `other`).
  - `client_id` *(Integer, Optional)*: ID of the client in the `crm_clients` table.

---

### B. Update an Existing Task (`update_task`)
Updates properties on an existing Kanban task.

* **JSON Body**:
```json
{
  "event_type": "update_task",
  "payload": {
    "task_id": 14,
    "status": "in_progress",
    "priority": "urgent",
    "description": "Emergency edit requests by client.",
    "assigned_to": 2
  }
}
```
* **Parameters**:
  - `task_id` *(Integer, Required)*: ID of the task to update.
  - `status` *(String, Optional)*: Enforces state machine transitions. Must be one of:
    `backlog`, `todo`, `in_progress`, `review`, `revision`, `approved`, `delivered`, `cancelled`.
  - `priority` *(String, Optional)*: One of `low`, `medium`, `high`, `urgent`.
  - `description` *(String, Optional)*: New task description text.
  - `assigned_to` *(Integer, Optional)*: The User ID of the assignee (referencing `users.id`).

---

### C. Update Operational Knowledge (`update_knowledge`)
Stores unstructured helper JSON objects into the operational knowledge base.

* **JSON Body**:
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
* **Parameters**:
  - `key` *(String, Required)*: Unique lookup string.
  - `knowledge_type` *(String, Optional)*: General category (e.g. `general`, `context`, `template`).
  - `content` *(Object/JSON, Required)*: Any structured JSON data containing instructions or parameters.

---

### D. Optimize Queue (`optimize_queue`)
*Reserved for sorting and queue ordering updates.*
```json
{
  "event_type": "optimize_queue",
  "payload": {}
}
```

---

## 3. SQLite Database Schema (Tables)

Below are details of the database tables configured in the `ops_dashboard.db` SQLite instance.

### `users`
System personnel accounts.
* `id` (INTEGER, Primary Key, Auto-increment)
* `email` (TEXT, Unique, Not Null)
* `password_hash` (TEXT, Not Null)
* `name` (TEXT, Not Null)
* `role` (TEXT, Not Null) - Enforced values: `'super_admin'`, `'admin'`, `'ops_video_editor'`, `'ops_social_media_manager'`
* `is_active` (INTEGER, Default: 1)
* `created_at` (TEXT)
* `updated_at` (TEXT)

### `crm_clients`
Client organizations and their integrations settings.
* `id` (INTEGER, Primary Key, Auto-increment)
* `name` (TEXT, Not Null)
* `client_type` (TEXT) - Enforced: `'marketing'`, `'artist_curation'`, `'both'`
* `contact_person` (TEXT)
* `contact_email` (TEXT)
* `contact_phone` (TEXT)
* `calendar_sync_link` (TEXT)
* `drive_folder_link` (TEXT)
* `instagram_access_token_enc` (TEXT, Encrypted)
* `instagram_business_account_id` (TEXT)
* `youtube_channel_id` (TEXT)
* `youtube_api_key_enc` (TEXT, Encrypted)
* `google_ads_customer_id` (TEXT)
* `consecutive_api_failures` (INTEGER)
* `api_status` (TEXT) - Enforced: `'active'`, `'warning'`, `'error'`
* `last_metric_fetch_at` (TEXT)
* `portal_token` (TEXT, Unique)
* `portal_enabled` (INTEGER)
* `portal_pin` (TEXT)
* `portal_last_accessed_at` (TEXT)
* `is_active` (INTEGER)

### `kanban_tasks`
The task workflow table.
* `id` (INTEGER, Primary Key, Auto-increment)
* `client_id` (INTEGER) - Foreign key referencing `crm_clients.id`
* `title` (TEXT, Not Null)
* `description` (TEXT)
* `status` (TEXT) - Enforced: `'backlog'`, `'todo'`, `'in_progress'`, `'review'`, `'revision'`, `'approved'`, `'delivered'`, `'cancelled'`
* `priority` (TEXT) - Enforced: `'low'`, `'medium'`, `'high'`, `'urgent'`
* `task_type` (TEXT) - Enforced: `'video'`, `'graphic'`, `'social'`, `'other'`
* `assigned_to` (INTEGER) - Foreign key referencing `users.id`
* `due_date` (TEXT)
* `completed_at` (TEXT)
* `revision_count` (INTEGER, Default: 0)
* `max_revisions` (INTEGER, Default: 3)
* `drive_link` (TEXT)
* `created_by` (INTEGER) - Foreign key referencing `users.id`
* `created_at` (TEXT)
* `updated_at` (TEXT)

### `openclaw_operational_knowledge`
Key-value store of metadata/settings configured by webhook updates.
* `id` (INTEGER, Primary Key, Auto-increment)
* `key` (TEXT, Unique, Not Null)
* `knowledge_type` (TEXT, Not Null)
* `content` (TEXT, JSON Format)
* `updated_at` (TEXT)

### `marketing_content_tracker`
Social media performance data tracking content items.
* `id` (INTEGER, Primary Key, Auto-increment)
* `client_id` (INTEGER) - Foreign key referencing `crm_clients.id`
* `platform` (TEXT) - Enforced: `'instagram'`, `'youtube'`
* `media_id` (TEXT)
* `date` (TEXT)
* `post_type` (TEXT) - Enforced: `'Story'`, `'Static'`, `'Carousel'`, `'Reel'`, `'Youtube'`, `'Short'`
* `title` (TEXT)
* `script` (TEXT)
* `status` (TEXT) - Enforced: `'Draft'`, `'Pending Client Approval'`, `'Client Approved'`, `'Client Rejected'`, `'Posted'`, `'Pending'`
* `views`, `likes`, `comments`, `shares`, `saves` (INTEGER)
* `avg_watch_time_pct` (REAL)
* `engagement_rate_pct`, `save_rate_pct`, `content_score` (REAL)
* `boosted` (TEXT)

### `artists`
Artist curation roster details.
* `id` (INTEGER, Primary Key, Auto-increment)
* `artist_id` (TEXT, Unique, Not Null)
* `name` (TEXT, Not Null)
* `category` (TEXT)
* `city` (TEXT)
* `phone` (TEXT)
* `email` (TEXT)
* `telegram_chat_id` (TEXT)
* `bank_details_enc` (TEXT, Encrypted)
* `total_performances` (INTEGER)
* `average_fee_inr` (REAL)
* `total_amount_paid_inr` (REAL)
* `payment_status` (TEXT)
* `reliability_score` (REAL)

### `gig_status`
Booking scheduling status records.
* `id` (INTEGER, Primary Key, Auto-increment)
* `client_id` (INTEGER) - Foreign key referencing `crm_clients.id`
* `artist_id` (INTEGER, Not Null) - Foreign key referencing `artists.id`
* `venue_id` (INTEGER) - Foreign key referencing `venues.id`
* `planning_cycle_id` (INTEGER) - Foreign key referencing `artist_planning_cycles.id`
* `gig_date` (TEXT, Not Null)
* `fee_inr`, `advance_paid` (REAL)
* `status` (TEXT) - Enforced: `'Paid'`, `'Pending'`, `'Advance Paid'`, `'Cancelled'`, `'Hold'`, `'Confirmed'`
* `confirmation_token` (TEXT)
* `token_expires_at` (TEXT)

### `venues`
Venues roster info.
* `id` (INTEGER, Primary Key, Auto-increment)
* `name` (TEXT, Not Null)
* `address`, `city`, `map_link` (TEXT)
* `poc_name`, `poc_phone` (TEXT)
* `gig_confirmed_message` (TEXT)

### `artist_planning_cycles`
Curation cycle definitions.
* `id` (INTEGER, Primary Key, Auto-increment)
* `cycle_label` (TEXT, Not Null)
* `start_date`, `end_date` (TEXT)
* `status` (TEXT) - Enforced: `'upcoming'`, `'open'`, `'admin_approved'`, `'finalised'`, `'completed'`

### `audit_logs`
Logs of all CRUD changes made in the Ops dashboard for compliance.
* `id` (INTEGER, Primary Key)
* `actor_id` (INTEGER)
* `actor_email` (TEXT)
* `action` (TEXT, Not Null)
* `entity_type` (TEXT, Not Null)
* `entity_id` (INTEGER)
* `diff` (TEXT, JSON formatted differences)
* `ip_address` (TEXT)
* `created_at` (TEXT)
