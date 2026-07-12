-- Asli Round 3 schema — spec §6. Server-side service-role access only; RLS deny-all.

create table sellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text not null,
  shop_name text not null,
  avatar_url text,
  trust_score int not null default 40,
  trust_band text not null default 'low' check (trust_band in ('high', 'medium', 'low')),
  kyc_status text not null default 'pending' check (kyc_status in ('pending', 'submitted', 'verified')),
  kyc_doc_url text,
  is_new boolean not null default true,
  passes int not null default 0,
  fails int not null default 0,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  auth0_sub text not null unique,
  email text not null,
  name text not null,
  role text not null check (role in ('seller', 'buyer', 'admin')),
  seller_id uuid references sellers (id),
  created_at timestamptz not null default now()
);
create index users_seller_id_idx on users (seller_id);

create table listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers (id),
  title text not null,
  description text not null default '',
  price int not null,
  category text not null,
  status text not null check (status in ('draft', 'pending', 'live', 'blocked', 'escalated', 'rejected')),
  flow_step text not null,
  verified boolean not null default false,
  size_chart jsonb,
  rank_boost numeric not null default 0,
  created_at timestamptz not null default now()
);
create index listings_seller_id_idx on listings (seller_id);

create table product_images (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id),
  url text not null,
  image_hash text not null,
  embedding_id text,
  kind text not null check (kind in ('catalog', 'live', 'flatlay', 'delivery', 'kyc'))
);
create index product_images_listing_id_idx on product_images (listing_id);

create table challenges (
  code text primary key,
  listing_id uuid references listings (id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index challenges_listing_id_idx on challenges (listing_id);

create table authenticity_checks (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id),
  agent text not null,
  payload jsonb not null default '{}',
  confidence numeric not null,
  action text not null,
  required_confidence numeric not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index authenticity_checks_listing_id_idx on authenticity_checks (listing_id);

create table size_measurements (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id),
  chest_cm numeric not null,
  length_cm numeric not null,
  waist_cm numeric not null,
  reference_used text not null,
  confidence numeric not null,
  mapped_size text not null
);
create index size_measurements_listing_id_idx on size_measurements (listing_id);

create table orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id),
  buyer_user_id uuid not null references users (id),
  address jsonb not null default '{}',
  payment_method text not null check (payment_method in ('cod', 'upi_mock')),
  status text not null check (status in ('placed', 'shipped', 'delivered')),
  placed_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index orders_listing_id_idx on orders (listing_id);
create index orders_buyer_user_id_idx on orders (buyer_user_id);

create table promises (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id),
  order_id uuid references orders (id),
  frozen jsonb not null default '{}',
  delivery_photo_url text,
  kept boolean,
  confidence numeric,
  checked_at timestamptz
);
create index promises_listing_id_idx on promises (listing_id);
create index promises_order_id_idx on promises (order_id);

create table trust_events (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references sellers (id),
  delta int not null,
  reason text not null,
  source text not null,
  created_at timestamptz not null default now()
);
create index trust_events_seller_id_idx on trust_events (seller_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id),
  status text not null check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  reviewer_user_id uuid references users (id),
  decided_at timestamptz
);
create index reviews_listing_id_idx on reviews (listing_id);
create index reviews_reviewer_user_id_idx on reviews (reviewer_user_id);

create table audit_log (
  id bigint generated always as identity primary key,
  listing_id uuid references listings (id),
  actor text not null,
  event text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_listing_id_idx on audit_log (listing_id);

-- users.seller_id ↔ sellers.user_id soft link (sellers created before users in seed).
alter table sellers add constraint sellers_user_id_fkey foreign key (user_id) references users (id);
create index sellers_user_id_idx on sellers (user_id);

-- RLS deny-all: no policies; only the service role (bypasses RLS) may touch these tables.
alter table users enable row level security;
alter table sellers enable row level security;
alter table listings enable row level security;
alter table product_images enable row level security;
alter table challenges enable row level security;
alter table authenticity_checks enable row level security;
alter table size_measurements enable row level security;
alter table orders enable row level security;
alter table promises enable row level security;
alter table trust_events enable row level security;
alter table reviews enable row level security;
alter table audit_log enable row level security;
