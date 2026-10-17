-- Migration: 084_add_client_control_flags.sql
-- Per-client publishing control flags, replacing ad-hoc "pause/stop"
-- instructions relayed through chat. Default OFF for every client — a
-- draft being ready or a monitor flagging a change is not sufficient to
-- publish; the relevant flag must also be on. Decision: 007, 2026-10-17
-- (vault: Companies/Hyphening/Decisions/Per-client publishing flags.md).
-- Toggled only via PATCH /api/clients/:id/flags, admin role only.

ALTER TABLE crm_clients ADD COLUMN blog_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_clients ADD COLUMN seo_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_clients ADD COLUMN ads_enabled INTEGER NOT NULL DEFAULT 0;
