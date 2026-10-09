-- Milestone 4: keep track of a booking's state and who it is for.
alter table bookings add column status text not null default 'booked' check (status in ('booked','cancelled'));
alter table bookings add column attendee_name text;
alter table bookings add column attendee_phone text;
alter table bookings add column cancelled_at timestamptz;
alter table bookings add column updated_at timestamptz not null default now();
