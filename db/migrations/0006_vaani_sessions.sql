-- Milestone 6: Vaani sends the caller's number in an early event and the transcript in a later one.
-- This table links the two by Vaani's room name.
create table vaani_sessions (
  room_name        text primary key,
  phone            text,
  started_at       timestamptz,
  transfer_status  text check (transfer_status in ('initiated','successful','failed')),
  transfer_type    text,
  transfer_phone   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table vaani_sessions enable row level security;
