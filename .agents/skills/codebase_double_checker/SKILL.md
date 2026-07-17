---
name: codebase_double_checker
description: Automatically double-checks SQL placeholder-column alignment, regex url extraction patterns, and deployment health checks before wrapping up.
---

# Codebase Double-Checker Skill

**Main Function:** Systematically verify backend parameters & placeholder counts, test link auto-extraction regexes against edge cases, and run DB checks & client build verification before declaring any task complete.

## Verification Checklist

Every time you modify backend routes, SQL queries, or extraction patterns, perform the following validation protocol:

### 1. SQL INSERT/UPDATE Parameter Alignment Check
- Count the exact number of:
  - Columns in the `INSERT INTO table (col1, col2...)` clause.
  - Places in the `VALUES (?, ?, 'hardcoded', ?...)` clause.
  - Positional arguments passed to the `.run(...)` statement.
- Ensure that `number of ? marks` === `number of arguments passed to .run(...)`.
- Ensure that `number of columns` === `number of total values (question marks + hardcoded values)`.

### 2. Auto-Extraction Regex Validation
- Whenever you modify or add regexes (e.g., in `linkExtractor.js`), test them against a suite of edge cases:
  - Standard watch URL structure.
  - Reel, short, watch, or post URL variants.
  - URLs containing query parameters (e.g., `?utm_source=...`, `&id=...`).
  - URLs with multiple numeric segments (e.g., username/posts/id vs numericPageId/posts/id).
  - URLs that should NOT match (bare domains, profile pages).

### 3. Frontend Form Parity Check
- Verify that any new schema columns are mapped across:
  - `CONTENT_FORM_DEFAULTS` inside `contentFormHelper.js`
  - `buildContentPayload` inside `contentFormHelper.js`
  - `buildContentFormState` inside `contentFormHelper.js`
  - `ContentModal.jsx` inputs grid alignment

### 4. Live Verification & Health Checks
- Push commits to the repository.
- Connect to the production server and pull latest.
- Compile the production frontend assets: `npm run build`.
- Restart the services via PM2.
- Perform a live HTTP GET health check on `/api/health` and verify the status is `"ok"` and database state is `"connected"`.
