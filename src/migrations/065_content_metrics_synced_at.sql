-- Migration: 065_content_metrics_synced_at.sql
-- Records when a row last had live metrics pulled.
--
-- The sweep is now bounded to a recent window so the call budget stays
-- proportional to current output rather than to everything ever posted. That
-- creates a gap: a row entered late — back-filled a quarter after the fact —
-- would fall outside the window on its first sight and never be fetched at all.
--
-- With a synced-at stamp the sweep can take anything it has never seen once,
-- whatever its date, and only then let the window govern refreshes. It also
-- gives the tracker an honest per-row answer to "are these numbers current?",
-- which previously could not be distinguished from "these are zero".

ALTER TABLE marketing_content_tracker ADD COLUMN metrics_synced_at TEXT;
