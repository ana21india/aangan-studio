-- Timed follow-ups (Milestone 3): track which reminders have been sent so none fire twice.
alter table handoffs add column overdue_alerted_at timestamptz;
alter table handoffs add column accepted_by_telegram_id bigint;
alter table escalations add column last_alerted_at timestamptz;
alter table escalations add column alerted_at timestamptz;
create index telegram_links_caller_idx on telegram_links (caller_id, created_at desc);
