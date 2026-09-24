-- FAST capacity hardening: indexes recommended by Supabase performance advisors.
-- These tables are currently empty, so index creation is low risk.

create index if not exists fast_communication_messages_reply_to_idx
  on public.fast_communication_messages (reply_to_id);

create index if not exists fast_communication_messages_sender_user_idx
  on public.fast_communication_messages (sender_user_id);

create index if not exists fast_communication_threads_user_idx
  on public.fast_communication_threads (user_id);
