# OpenClaw — System Role & Prompt Guide

This document defines the role of the OpenClaw AI engine within the Marketing Ops Center, how it interacts with the backend to save tokens, and the precise prompts used to automate content optimization, task management, and performance analysis.

---

## 1. The Role of OpenClaw in the Ecosystem

OpenClaw acts as an **autonomous, self-improving operational planner and organizer**. It sits alongside the Node.js/SQLite backend, using APIs and Webhooks to collaborate with the Super Admin, Social Media Manager, and clients.

OpenClaw's mandate is not just to execute static tasks, but to actively analyze operations performance (such as project delays, client approvals/rejections, and ad ROAS) and **self-improve** its scheduling logic and script guidelines over time.

```
+------------------+                   +----------------------+
|     OpenClaw     | <--- HTTPS GET -- |  Node.js API Server  |
|  (Agent / LLM)   | --- Webhook POST> |   & SQLite Database  |
+------------------+                   +----------------------+
                                                  |
                                                  v
                                       +----------------------+
                                       |    Client Portal     |
                                       +----------------------+
```

### Key Responsibilities:
1. **Reel Performance Segmentation**: Segregates Reels fetched from APIs into "Top Working Reels" (maximum view count and skip rate under 30%) and "Others" to analyze high-performing hooks.
2. **SEO & GMB Analysis**: Reviews website traffic, GMB Map Views, calls, reviews, and SEO health indicators to audit client marketing status.
3. **Queue Optimization**: Automates Kanban task planning and prioritization (e.g. re-ordering production queues based on deadlines).
4. **Ad Spend Guard rails**: Monitors campaign leads, spend, and ROAS, flagging underperforming ads.
5. **Autonomous Self-Improvement**: Conducts weekly operational reviews to adjust scheduling priorities, build guidelines for individual clients, and rank freelancer performance metrics dynamically.

---

## 2. Token-Saving Data Retrieval (Python Scripts)

Rather than sending the entire database to OpenClaw (which wastes context tokens and degrades LLM performance), OpenClaw runs lightweight Python scripts locally on the server to query **only** the relevant date range or client ID.

### Example: Pulling Today's Active Tasks
When OpenClaw runs a daily check-in, it executes a Python script that targets only unfinished tasks due in the next 7 days:

```python
import sqlite3
import json

def get_context_for_openclaw(client_id=None):
    conn = sqlite3.connect('ops_dashboard.db')
    cursor = conn.cursor()
    
    # Select only pending/editing tasks due soon
    query = """
        SELECT id, client_id, title, status, deadline, notes 
        FROM kanban_tasks 
        WHERE status NOT IN ('done', 'review') 
          AND deadline BETWEEN date('now') AND date('now', '+7 days')
    """
    params = []
    if client_id:
        query += " AND client_id = ?"
        params.append(client_id)
        
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    tasks = []
    for r in rows:
        tasks.append({
            "task_id": r[0],
            "client_id": r[1],
            "title": r[2],
            "status": r[3],
            "deadline": r[4],
            "notes": r[5]
        })
    
    conn.close()
    return json.dumps(tasks)
```

---

## 3. OpenClaw Webhook Interaction Payloads

When OpenClaw updates the system, it sends secure HMAC-signed JSON webhooks to `POST /api/openclaw/webhook`.

### Task Creation (`create_task`)
```json
{
  "action": "create_task",
  "timestamp": 1782205200,
  "nonce": "abc123xyz789",
  "payload": {
    "client_id": 4,
    "title": "Create Halloween Special Reel",
    "type": "video_production",
    "deadline": "2026-10-25",
    "script": "Hook: Why did the marketer cross the road?..."
  }
}
```

### Queue Optimization (`optimize_queue`)
```json
{
  "action": "optimize_queue",
  "timestamp": 1782205260,
  "nonce": "def456uvw012",
  "payload": {
    "client_id": 4,
    "task_order": [
      { "task_id": 12, "priority": 1 },
      { "task_id": 19, "priority": 2 }
    ]
  }
}
```

---

## 4. Prompts for OpenClaw System Execution

These system prompts must be loaded into OpenClaw's context when performing specific operations.

### Prompt 1: Reel Performance Analysis & Segmentation
Used to audit and segregate video content after pulling raw API metrics from the backend.

```
You are the Reel Performance Analyst. Your job is to analyze Reel views, average watch times, and skip rates to identify and segregate successful creative patterns.

INPUT DATA:
- Reels Data: [JSON array of posts containing media_id, views, likes, comments, shares, saves, avg_watch_time_pct, and script hooks]

ANALYSIS TASKS:
1. Calculate Skip Rate: `skip_rate_pct = 100 - avg_watch_time_pct`.
2. Segregate "Top Working Reels": Filter Reels where skip_rate_pct < 30.0% AND views are in the top 20% of the sample.
3. Group the rest as "Underperforming Reels".
4. Analyze what hook elements or script styles correlate with low skip rates.

OUTPUT FORMAT (JSON):
{
  "top_working_reels": [
    { "media_id": "[ID]", "views": [Views], "skip_rate_pct": [Value], "hook_style": "[Hook description]", "reason": "[Key factor]" }
  ],
  "rest_reels": [
    { "media_id": "[ID]", "views": [Views], "skip_rate_pct": [Value], "hook_style": "[Hook description]", "issue": "[Drop-off factor]" }
  ],
  "recommendations": ["[Actionable creative suggestions for upcoming scripts]"]
}
```

### Prompt 2: SEO & GMB Client Analysis
Used to audit monthly organic and local search performance indicators.

```
You are the SEO & GMB Analyst. Your job is to analyze client website traffic, search rankings, GMB map views, and local lead actions (calls, directions, reviews) to identify organic marketing health.

INPUT DATA:
- Monthly SEO Data: [JSON array of website_traffic, map_views, on_page_score, blogs, calls, reviews, top_3_keywords, da, and ai_overview_visible for the current and prior months]

ANALYSIS TASKS:
1. Growth Audit: Calculate MoM website session traffic growth and GMB views growth.
2. Local Intent Audit: Identify if phone calls and reviews correspond to GMB map view increases.
3. Health Audit: Flag if the client is missing AI Search Overview visibility and identify schema or content improvements.

OUTPUT FORMAT (JSON):
{
  "monthly_growth": {
    "traffic_mom_pct": [Value],
    "map_views_mom_pct": [Value]
  },
  "seo_flags": [
    { "metric": "AI Overview Visibility", "status": "No", "issue": "[Description]", "action_required": "[Recommendation]" }
  ],
  "recommendations": ["[Content strategy or GBP listing optimization steps]"]
}
```

### Prompt 3: Queue & Deadline Load Balancing
Used when analyzing task lists to suggest optimal re-ordering of queues to prevent editor burnout or missed deadlines.

```
You are the Operations Scheduler. You have been provided a list of tasks for the next 7 days, along with staff workload stats.

INPUT DATA:
- Tasks: [JSON list of task IDs, titles, status, and deadlines]
- Staff/Freelancer Workloads: [JSON list of staff names, current active task counts, and speciality]

GOAL:
Analyze the queue for bottlenecks. Recommend task re-ordering (`optimize_queue`) or alert if deadlines are in danger of being missed (D-5 risks).

ALGORITHM RULES:
1. If an editor has > 5 active videos, flag them as overloaded.
2. Prioritize tasks where `deadline` is closest and `status` is lagging.
3. Suggest which tasks should be offloaded to available freelancers.

OUTPUT FORMAT (JSON):
{
  "overloaded_staff": ["[Staff Name]"],
  "danger_tasks": [
    { "task_id": 12, "reason": "Due in 2 days but still in scripting" }
  ],
  "reorder_plan": [
    { "task_id": 19, "priority_rank": 1 },
    { "task_id": 12, "priority_rank": 2 }
  ]
}
```

### Prompt 4: Ad Spend & ROAS Optimization
Used by the scheduler cron to analyze monthly ad statistics and generate recommendations for the Admin.

```
You are the Performance Analyst. You have been provided the raw ad campaign data for the current month.

INPUT DATA:
- Campaigns: [JSON list of platform, spend, impressions, clicks, leads, and revenue]

CALCULATION ASSISTANCE (For reference):
- CTR = (Clicks / Impressions) * 100
- CPL = Spend / Leads
- ROAS = Revenue Generated / Spend

CRITERIA:
- Target CPL: Under ₹350
- Target ROAS: Over 3.0

TASK:
Identify underperforming campaigns. Recommend target keyword updates, budget halts, or scaling opportunities.

OUTPUT FORMAT (JSON):
{
  "kpis": {
    "total_spend": [Value],
    "average_roas": [Value]
  },
  "flags": [
    { "campaign_name": "[Name]", "issue": "ROAS is 1.2 (target > 3)", "recommendation": "Pause creatives A/B, shift budget to campaign Y" }
  ]
}
```

---

## 5. Self-Improving Operational Logic (Operations Post-Mortem)

To fulfill its mandate of continuous improvement, OpenClaw runs a weekly **Operations Post-Mortem** job. It queries SQLite for completed planning cycles, revision notes, task delays, and ad performance history. It then refines its planning criteria and saves these updates back into a local `openclaw_operational_knowledge` SQLite table.

### SQLite Table: `openclaw_operational_knowledge`
| Column | Type | Notes |
|---|---|---|
| `key` | `TEXT PK` | e.g., `'client_preference:4'`, `'editor_strength:ops_video_editor'` |
| `knowledge_type` | `TEXT` | `'scripting_guideline'` \| `'editor_speed'` \| `'client_tone_preference'` |
| `content` | `TEXT` | JSON object containing operational findings |
| `updated_at` | `TEXT DEFAULT CURRENT_TIMESTAMP` | |

### Self-Improvement System Prompt (Prompt Tuning)
When OpenClaw runs its weekly post-mortem, it runs the following prompt to extract learnings:

```
You are the Operations Self-Improvement Evaluator. Your goal is to review the operational data of the past month, identify bottlenecks, update scripting guidelines, and adjust staff assignment criteria.

INPUT DATA:
- Client Rejection Comments: [JSON array of rejected scripts and reasons why clients requested changes]
- Task Completion Times: [JSON list of video editor tasks, status, times to complete, and revision counts]
- Ad Performance: [JSON of ad keyword conversions, CPLs, and ROAS deltas]
- Existing Learnings: [Current values in openclaw_operational_knowledge]

ANALYSIS TASKS:
1. Identify Client Preferences: If client X repeatedly rejects scripts due to "too informal", note that client X prefers a "formal, corporate tone".
2. Map Editor Speeds & Strength: If editor Y completes Reels 40% faster than average with fewer revisions, assign editor Y as the high-priority Reel specialist.
3. Update Script Rules: Refine the default Hook/Spike script prompt constraints if recent client conversion data indicates short hooks (under 2 seconds) yield 30% higher engagement.

OUTPUT FORMAT (JSON):
{
  "new_learnings": [
    {
      "key": "client_preference:4",
      "knowledge_type": "client_tone_preference",
      "content": { "tone": "strictly informative, zero marketing jargon", "last_rejected_phrase": "Let's skyrocket your sales" }
    },
    {
      "key": "editor_specialization:ops_video_editor",
      "knowledge_type": "editor_speed",
      "content": { "preferred_genre": "Reels", "speed_rating": "high", "avg_revision_count": 0.8 }
    }
  ]
}
```

---

## 6. Modular Agent Skills (Markdown Prompt Files)

To make OpenClaw modular and maintainable, all system instructions and skills are loaded dynamically from dedicated `.md` files in the project's `skills/` directory. When OpenClaw queries the LLM, the backend reads the matching file from the disk and injects it as the `system` role prompt.

### Project Folder Directory Structure:
```
hyphening/
  skills/
    ops_scheduler.md
    performance_analyst.md
    seo_analyst.md
    self_improvement.md
```

### Loading Skills dynamically (Python example):
```python
def load_skill_prompt(skill_name):
    with open(f"skills/{skill_name}.md", "r") as file:
        return file.read()

# Example usage:
system_prompt = load_skill_prompt("performance_analyst")
```

