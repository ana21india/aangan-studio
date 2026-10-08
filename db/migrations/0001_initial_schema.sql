-- Aangan Studio phone enquiry agent: initial schema.
-- Only the server (service role) reads and writes. RLS is on for every table
-- with no public policies, so the browser can never touch these tables directly.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- callers
create table callers (
  id                  uuid primary key default gen_random_uuid(),
  phone               text not null unique check (phone ~ '^\+[1-9][0-9]{6,14}$'), -- E.164
  name                text,
  hubspot_contact_id  text,
  first_seen          timestamptz not null default now(),
  last_seen           timestamptz not null default now()
);

-- -------------------------------------------------------------- enquiries
-- One enquiry can span several calls (a dropped call plus the retry; see DECISIONS.md D-010).
create table enquiries (
  id                  uuid primary key default gen_random_uuid(),
  caller_id           uuid not null references callers(id),
  status              text not null default 'open'
                        check (status in ('open','resolved')),
  -- extracted fields (null = caller did not say; never guessed)
  name                text,
  space_type          text check (space_type in ('home','office','other')),
  size_sqft           integer,
  location            text,
  city                text,
  scope               text check (scope in ('full_interior','partial_home','single_room','renovation','other')),
  timeline_text       text,
  handover_date       text,
  budget_text         text,          -- recorded only if the caller volunteered it
  budget_inr_low      bigint,
  budget_inr_high     bigint,
  source              text,
  decision_maker_note text,
  caller_asked_about  text,
  -- scoring
  criteria            jsonb,         -- {real_project:{status,reason}, service_area:{...}, timeline:{...}, budget:{...}, decision_maker:{...}}
  score               smallint check (score between 0 and 10),  -- display only; category comes from criteria rules
  category            text check (category in ('qualified','not_qualified','unsure')),
  reasons             jsonb,
  low_confidence      boolean not null default false,
  handoff_note        text,
  hubspot_deal_id     text,
  booking_link_sent_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index enquiries_caller_idx on enquiries (caller_id, created_at desc);

-- ------------------------------------------------------------------ calls
create table calls (
  id                  uuid primary key default gen_random_uuid(),
  caller_id           uuid references callers(id),
  enquiry_id          uuid references enquiries(id),
  provider_call_id    text not null unique,   -- idempotency key
  channel             text not null default 'phone' check (channel in ('phone','whatsapp','web')),
  started_at          timestamptz,
  ended_at            timestamptz,
  duration_sec        integer,
  in_hours            boolean,                -- 10am-7pm IST, computed server-side
  transcript          text,
  recording_url       text,
  status              text not null check (status in ('completed','dropped','missed','transferred')),
  processing_state    text not null default 'received'
                        check (processing_state in ('received','processed','failed')),
  processing_error    text,
  created_at          timestamptz not null default now()
);
create index calls_started_idx on calls (started_at desc);
create index calls_caller_idx on calls (caller_id, started_at desc);

-- --------------------------------------------------------------- handoffs
create table handoffs (
  id                  uuid primary key default gen_random_uuid(),
  enquiry_id          uuid not null references enquiries(id),
  telegram_message_id bigint,
  sent_at             timestamptz not null default now(),
  accepted_by         text,
  accepted_at         timestamptz
);
create index handoffs_enquiry_idx on handoffs (enquiry_id);

-- --------------------------------------------------------------- bookings
create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  enquiry_id          uuid references enquiries(id),
  cal_booking_id      text not null unique,
  scheduled_for       timestamptz,
  created_at          timestamptz not null default now()
);

-- ------------------------------------------------------------ escalations
create table escalations (
  id                  uuid primary key default gen_random_uuid(),
  call_id             uuid references calls(id),
  enquiry_id          uuid references enquiries(id),
  reason              text not null,  -- complaint | asked_for_person | unsure | missed_call | dropped_call | budget_mismatch | decision_maker | followup_overdue | pipeline_failure
  urgent              boolean not null default false,
  routed_to           text,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);
create index escalations_open_idx on escalations (created_at) where resolved_at is null;

-- ------------------------------------------------- telegram link follow-up
-- Caller must press Start on the bot before it can message them (D-004).
create table telegram_links (
  id                  uuid primary key default gen_random_uuid(),
  enquiry_id          uuid not null references enquiries(id),
  caller_id           uuid not null references callers(id),
  start_token         text not null unique,   -- carried in t.me/<bot>?start=<token>
  telegram_chat_id    bigint,
  started_at          timestamptz,            -- when the caller pressed Start
  link_sent_at        timestamptz,
  nudge_due_at        timestamptz,            -- created_at + 10 min
  nudge_sent_at       timestamptz,
  morning_due_at      timestamptz,
  morning_sent_at     timestamptz,
  created_at          timestamptz not null default now()
);

-- ------------------------------------------------------------ cost_events
create table cost_events (
  id                  uuid primary key default gen_random_uuid(),
  call_id             uuid references calls(id),   -- null for monthly fixed costs
  line                text not null check (line in ('vaani_minutes','gemini_tokens','sms','fixed_monthly')),
  quantity            numeric not null,
  unit_cost_inr       numeric not null,
  amount_inr          numeric not null,
  created_at          timestamptz not null default now()
);
create index cost_events_call_idx on cost_events (call_id);

-- -------------------------------------------------------- knowledge_docs
create table knowledge_docs (
  name                text primary key,
  content             text not null,
  version             integer not null default 1,
  sync_to_vaani       boolean not null default true,  -- pricing.md is false: the live agent never sees it
  synced_to_vaani_at  timestamptz,
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------- config
create table config (
  key                 text primary key,
  value               jsonb not null,
  description         text,
  updated_at          timestamptz not null default now()
);

insert into config (key, value, description) values
  ('PRICING_MODE',                 '"none"',            'none | range_with_disclaimer. Owner sets this; do not change in code.'),
  ('AGENT_ACTIVE_HOURS',           '"all"',             'all | after_hours_only | missed_calls_only'),
  ('QUALIFIED_THRESHOLD',          '6',                 'Display score cutoff. Category itself comes from the five-criteria rules.'),
  ('MIN_LEAD_WEEKS',               '6',                 'Cannot start execution on a project needed in under this many weeks (D-003).'),
  ('MERGE_WINDOW_MINUTES',         '60',                'Repeat calls from one number inside this window share one enquiry (D-010).'),
  ('BUDGET_FLOOR_PCT',             '100',               'Volunteered budget below this % of the pricing.md minimum is flagged (D-005).'),
  ('BUDGET_MISMATCH_ACTION',       '"front_desk"',      'front_desk | decline. Starts as front_desk.'),
  ('TELEGRAM_NUDGE_MINUTES',       '10',                'Front-desk alert if caller has not pressed Start by then (D-004).'),
  ('OVERDUE_HANDOFF_MINUTES',      '120',               'Qualified handoff not accepted in this many in-hours minutes is re-alerted.'),
  ('RETENTION_RECORDING_DAYS',     '90',                'Recordings deleted after this many days (D-011).'),
  ('RETENTION_TRANSCRIPT_DAYS',    '365',               'Transcripts and extracted fields deleted or anonymised after this many days.'),
  ('OFFICE_HOURS_START',           '10',                'IST hour'),
  ('OFFICE_HOURS_END',             '19',                'IST hour');

-- -------------------------------------------------------------------- RLS
alter table callers         enable row level security;
alter table enquiries       enable row level security;
alter table calls           enable row level security;
alter table handoffs        enable row level security;
alter table bookings        enable row level security;
alter table escalations     enable row level security;
alter table telegram_links  enable row level security;
alter table cost_events     enable row level security;
alter table knowledge_docs  enable row level security;
alter table config          enable row level security;
-- No policies on purpose: only the service role (server) can read or write.
