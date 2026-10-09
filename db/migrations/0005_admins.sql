-- Milestone 5: dashboard logins. Passwords are stored only as salted scrypt hashes.
create table admins (
  email            text primary key check (email = lower(email)),
  name             text,
  password_hash    text,
  must_change      boolean not null default true,
  failed_attempts  integer not null default 0,
  locked_until     timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now()
);
alter table admins enable row level security;
