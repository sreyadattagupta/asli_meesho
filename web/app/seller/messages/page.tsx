// Seller inbox. One thread per order placed against this seller's listings — the guard and the
// thread list are both derived from real orders, so there is nothing here to fake.
import { requireSeller } from "@/lib/guards";
import { PageHeader } from "@/components/nav/PageHeader";
import { Inbox } from "@/features/messages/Inbox";

export default async function SellerMessages() {
  await requireSeller();
  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Buyers who ordered from you. A conversation opens with each order."
      />
      <Inbox />
    </>
  );
}
