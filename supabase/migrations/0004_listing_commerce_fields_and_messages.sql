-- Wizard fields + order-scoped buyer↔seller messages.
--
-- Two changes, one migration, because they arrive with the same feature (the listing wizard and the
-- portals around it).

-- ── 1. Listing commerce fields ──────────────────────────────────────────────
-- Collected by the wizard's Pricing and Inventory steps. All nullable: every existing row predates
-- them, and a listing is sellable without an MRP or a SKU. `stock` NULL means "not tracked", which
-- is deliberately not the same as 0 ("sold out").
alter table public.listings add column if not exists mrp int;
alter table public.listings add column if not exists stock int;
alter table public.listings add column if not exists sku text;

-- An MRP at or below the selling price is a fake discount. The Pricing step blocks it in the UI and
-- the zod schema bounds it; this is the backstop that means no path can write one.
alter table public.listings drop constraint if exists listings_mrp_above_price_check;
alter table public.listings add constraint listings_mrp_above_price_check
  check (mrp is null or mrp > price);

alter table public.listings drop constraint if exists listings_stock_check;
alter table public.listings add constraint listings_stock_check
  check (stock is null or stock >= 0);

-- Drafts are created before the seller types a title: the wizard runs Agent 1 and Agent 2 first, so
-- the row exists (checks and images reference its id) while title is still ''. The publish route
-- refuses an untitled listing, so an empty title can never reach the marketplace.
comment on column public.listings.title is
  'May be empty while status = draft; the publish route enforces a real title before going live.';

-- ── 2. Messages ─────────────────────────────────────────────────────────────
-- Scoped to an order, not free-form. The order names the buyer and, through the listing, the seller,
-- so "may this person read this thread?" is answered by rows we already have rather than a separate
-- ACL table. No order ⇒ no thread ⇒ no unsolicited messaging.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  listing_id uuid not null references public.listings (id),
  from_user_id uuid not null references public.users (id),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- The two reads this table gets: one thread (by order), and an inbox (many orders at once).
create index if not exists messages_order_id_idx on public.messages (order_id, created_at);
-- Partial index: the unread badge only ever counts rows where read_at is null.
create index if not exists messages_unread_idx on public.messages (order_id) where read_at is null;

-- RLS deny-all, like every other table here: only the service role reaches it, and the API routes
-- prove participation before reading or writing.
alter table public.messages enable row level security;
