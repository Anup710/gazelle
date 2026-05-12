-- Migration 002: persist chat history.
-- Run this once in the Supabase SQL editor before deploying the
-- persist-chat-history feature. Safe to re-run (IF NOT EXISTS everywhere).
-- Reversible via 002_chat_history_rollback.sql.
--
-- Two changes:
--   1. New `messages` table — one row per user/assistant turn, scoped by session_id.
--      Cascades on jobs delete so session deletion wipes its history automatically.
--   2. New columns on `jobs`:
--        - conversation_summary text  — server-side mirror of the compacted summary
--        - turn_count int             — server-side mirror of completed user turns

create table if not exists messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references jobs(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  citations   jsonb not null default '[]'::jsonb,
  language    text,
  created_at  timestamptz not null default now()
);

create index if not exists messages_session_idx on messages (session_id, created_at);

alter table jobs add column if not exists conversation_summary text;
alter table jobs add column if not exists turn_count int not null default 0;
