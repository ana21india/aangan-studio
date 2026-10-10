-- Milestone 6: a consultation booked during the call arrives before the call-ended event creates the enquiry.
-- Such a booking waits, unmatched, and is attached when the call is processed; if it is still unmatched after a
-- while, the front desk is told once.
alter table bookings add column alerted_at timestamptz;
create index bookings_unmatched_idx on bookings (created_at) where enquiry_id is null;
