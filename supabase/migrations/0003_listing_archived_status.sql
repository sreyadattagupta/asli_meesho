-- Add 'archived' to the listing status check.
--
-- A seller removing a listing must not hard-delete the row: eight tables reference listings (id)
-- without cascade, and two of them are orders and audit_log. Deleting would either fail on the FK or
-- take a buyer's purchase history and the append-only decision trail (invariant #8) with it. Real
-- marketplaces archive, so the row survives, the references stay intact, and the listing leaves the
-- marketplace feed (which selects status = 'live') and the seller's default product list.
alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('draft', 'pending', 'live', 'blocked', 'escalated', 'rejected', 'archived'));
