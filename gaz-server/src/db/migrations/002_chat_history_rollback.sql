-- Rollback for 002_chat_history.sql.
-- Only run this if you need to fully undo the chat-history persistence schema.
--
-- WARNING: dropping `messages` deletes ALL persisted chat history across every
-- session. Take a SQL dump first if there is anything you want to keep:
--   pg_dump "$SUPABASE_DB_URL" --table=public.messages --data-only --file=backup_messages.sql

drop table if exists messages;

alter table jobs drop column if exists turn_count;
alter table jobs drop column if exists conversation_summary;
