-- Atlanta Pulse "All White Party" ticketing: orders, individual e-tickets and
-- started-checkout capture. Safe to run more than once (idempotent).
-- Run it in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- Orders: one row per paid Stripe Checkout session. The session id is the
-- primary key, which is what makes ticket issuance idempotent.
create table if not exists awp_orders (
  session_id text primary key,
  email text,
  name text,
  phone text,
  amount_total integer,
  newsletter_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

-- Re-runs against an older/partial schema pick up any missing columns.
alter table awp_orders add column if not exists email text;
alter table awp_orders add column if not exists name text;
alter table awp_orders add column if not exists phone text;
alter table awp_orders add column if not exists amount_total integer;
alter table awp_orders add column if not exists newsletter_opt_in boolean not null default false;
alter table awp_orders add column if not exists created_at timestamptz not null default now();

-- Tickets: one row per seat, each with its own random code (the QR payload).
create table if not exists awp_tickets (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  session_id text not null references awp_orders(session_id),
  tier text not null,
  buyer_email text,
  guest_name text,
  status text not null default 'valid' check (status in ('valid', 'used')),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table awp_tickets add column if not exists buyer_email text;
alter table awp_tickets add column if not exists guest_name text;
alter table awp_tickets add column if not exists used_at timestamptz;
alter table awp_tickets add column if not exists created_at timestamptz not null default now();

create index if not exists awp_tickets_tier_idx on awp_tickets (tier);
create index if not exists awp_tickets_session_idx on awp_tickets (session_id);

-- Started-checkout capture: whoever taps Pay is logged before the Stripe
-- redirect, so abandoned checkouts can be followed up with.
create table if not exists awp_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  email text,
  name text,
  items text,
  created_at timestamptz not null default now()
);

alter table awp_checkout_intents add column if not exists email text;
alter table awp_checkout_intents add column if not exists name text;
alter table awp_checkout_intents add column if not exists items text;
alter table awp_checkout_intents add column if not exists created_at timestamptz not null default now();

create index if not exists awp_checkout_intents_email_idx on awp_checkout_intents (email);

-- Only the server (service role key) touches these tables. Row level security
-- is enabled with NO policies, so the public anon/authenticated API roles can
-- read and write nothing. The service role bypasses RLS.
alter table awp_orders enable row level security;
alter table awp_tickets enable row level security;
alter table awp_checkout_intents enable row level security;

-- Belt and braces: also remove the default table grants for the public roles.
revoke all on table awp_orders from anon, authenticated;
revoke all on table awp_tickets from anon, authenticated;
revoke all on table awp_checkout_intents from anon, authenticated;
