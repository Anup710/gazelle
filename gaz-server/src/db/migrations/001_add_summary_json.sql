-- Migration: add summary_json column to jobs table.
-- Run this once in the Supabase SQL editor before deploying the
-- summary-intent-routing feature. Safe to re-run (IF NOT EXISTS).
--
-- The column caches a structured per-video summary produced lazily on the
-- first summary-intent query. Shape:
--   {
--     "tldr": "<one-paragraph overview>",
--     "key_points": ["...", "..."],
--     "outline": [{"title": "...", "start": <sec>, "end": <sec>}]
--   }

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS summary_json JSONB;
