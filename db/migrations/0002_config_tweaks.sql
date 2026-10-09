-- Budget flags go to the front desk with a lenient 60% floor (a person reviews them, so false flags are cheap).
update config set value = '60' where key = 'BUDGET_FLOOR_PCT';

insert into config (key, value, description) values
  ('BUDGET_FLOORS', '{"residential_per_sqft":1800,"commercial_per_sqft":1200,"single_room":350000}',
   'Internal minimums from pricing.md. Used only after the call, never by the live agent.'),
  ('COMMERCIAL_MIN_SQFT_REVIEW', '500',
   'Commercial spaces under this many sq ft go to the front desk as unsure (D-017).')
on conflict (key) do nothing;
