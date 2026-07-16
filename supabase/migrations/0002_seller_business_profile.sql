-- Seller business profile — the fields a real marketplace collects at onboarding.
--
-- All nullable: every existing seller row predates them, and a seller can list before the profile is
-- complete (KYC status already carries that state).
--
-- Deliberately absent: full bank account number and IFSC. The portal shows the last four digits so a
-- seller can recognise their payout account; storing the rest would create an obligation this demo
-- has no reason to take on.
alter table if exists public.sellers
  add column if not exists business_name text,
  add column if not exists gst          text,
  add column if not exists pan          text,
  add column if not exists address      text,
  add column if not exists mobile       text,
  add column if not exists bank_last4   text;
