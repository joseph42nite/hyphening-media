-- Migration: 066_freelancer_monthly_payments.sql
-- Records how many videos a freelancer has been paid for in a given month.
--
-- freelancers.videos_paid is a single running counter against a lifetime count
-- of posted videos, which answers "what do we owe in total" and nothing else.
-- Freelancers invoice by month, so the question actually being asked — what is
-- due for July — cannot be derived from it: the counter has no dates, and
-- subtracting it from one month's output would credit that month with payments
-- made for every earlier one.
--
-- Videos are attributed to a month by the content row's own date, so a month's
-- earnings stay fixed once its posts are logged. A missing row means nothing has
-- been paid for that month, which is the correct default for a month that has
-- only just started.
--
-- The lifetime counter is left in place and still drives the all-time view; this
-- table only governs a view scoped to a specific month.

CREATE TABLE IF NOT EXISTS freelancer_monthly_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  freelancer_id INTEGER NOT NULL,
  month TEXT NOT NULL,
  videos_paid INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (freelancer_id, month),
  FOREIGN KEY (freelancer_id) REFERENCES freelancers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_freelancer_monthly_payments_month
  ON freelancer_monthly_payments(month);
