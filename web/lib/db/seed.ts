// Idempotent demo seed — populates every screen on first load (spec §6 fixture counts).
import type { Repo } from "./repo";
import type { Listing } from "./types";

const SEED_MARKER = "__seed_marker__";

interface SeedListing {
  title: string; price: number; category: string; verified: boolean;
  status: Listing["status"]; rankBoost: number; image: string;
  sizeChart?: Record<string, number>;
}

// 16 listings across 4 categories; 2 escalated (pending review), 1 blocked, mix of verified.
const LISTINGS: (SeedListing & { seller: 0 | 1 | 2 })[] = [
  { seller: 0, title: "Banarasi Silk Saree — Magenta Zari", price: 749, category: "sarees", verified: true, status: "live", rankBoost: 3, image: "/mock/sarees-1.svg", sizeChart: { length_cm: 550, width_cm: 110 } },
  { seller: 0, title: "Kanjivaram-style Festive Saree", price: 899, category: "sarees", verified: true, status: "live", rankBoost: 2, image: "/mock/sarees-2.svg", sizeChart: { length_cm: 560, width_cm: 112 } },
  { seller: 0, title: "Anarkali Kurti — Violet Block Print", price: 449, category: "kurtis", verified: true, status: "live", rankBoost: 2, image: "/mock/kurtis-1.svg", sizeChart: { chest_cm: 96, length_cm: 118, waist_cm: 88 } },
  { seller: 0, title: "Straight Cotton Kurti — Rose", price: 349, category: "kurtis", verified: true, status: "live", rankBoost: 1, image: "/mock/kurtis-2.svg", sizeChart: { chest_cm: 92, length_cm: 112, waist_cm: 84 } },
  { seller: 0, title: "Kundan Necklace Set — Bridal", price: 599, category: "jewellery", verified: true, status: "live", rankBoost: 1, image: "/mock/jewellery-1.svg" },
  { seller: 0, title: "Ethnic Juttis — Gold Thread", price: 499, category: "footwear", verified: true, status: "live", rankBoost: 1, image: "/mock/footwear-1.svg" },
  { seller: 1, title: "Oxidised Jhumkas — Peacock", price: 249, category: "jewellery", verified: true, status: "live", rankBoost: 1, image: "/mock/jewellery-2.svg" },
  { seller: 1, title: "Casual Sandals — Tan Strap", price: 399, category: "footwear", verified: false, status: "live", rankBoost: 0, image: "/mock/footwear-2.svg" },
  { seller: 1, title: "Printed Georgette Saree — Teal", price: 549, category: "sarees", verified: false, status: "live", rankBoost: 0, image: "/mock/sarees-2.svg" },
  { seller: 1, title: "A-line Kurti — Mustard", price: 329, category: "kurtis", verified: false, status: "live", rankBoost: 0, image: "/mock/kurtis-2.svg" },
  { seller: 1, title: "Silver-tone Anklet Pair", price: 199, category: "jewellery", verified: false, status: "live", rankBoost: 0, image: "/mock/jewellery-1.svg" },
  { seller: 2, title: "Chiffon Saree — Sunset Ombre", price: 649, category: "sarees", verified: false, status: "live", rankBoost: 0, image: "/mock/sarees-1.svg" },
  { seller: 2, title: "Ethnic Mojaris — Maroon", price: 459, category: "footwear", verified: false, status: "live", rankBoost: 0, image: "/mock/footwear-1.svg" },
  { seller: 2, title: "Designer Kurti — Indigo Dabu", price: 519, category: "kurtis", verified: false, status: "escalated", rankBoost: 0, image: "/mock/kurtis-1.svg" },
  { seller: 2, title: "Temple Jewellery Set — Antique", price: 799, category: "jewellery", verified: false, status: "escalated", rankBoost: 0, image: "/mock/jewellery-2.svg" },
  { seller: 2, title: "Party Heels — Rose Gold", price: 689, category: "footwear", verified: false, status: "blocked", rankBoost: 0, image: "/mock/footwear-2.svg" },
];

/** Seed the repo with demo data. Safe to call repeatedly (marker listing guards). */
export async function seedRepo(repo: Repo): Promise<void> {
  const existing = await repo.listListings();
  if (existing.some(l => l.title === SEED_MARKER)) return;

  const priya = await repo.createSeller({
    name: "Priya Sharma", shopName: "Priya's Ethnic Studio",
    trustScore: 88, trustBand: "high", kycStatus: "verified",
    isNew: false, passes: 34, fails: 1,
  });
  const rohan = await repo.createSeller({
    name: "Rohan Verma", shopName: "Verma Fashion Hub",
    trustScore: 55, trustBand: "medium", kycStatus: "verified",
    isNew: false, passes: 9, fails: 3,
  });
  const fresh = await repo.createSeller({
    name: "Fresh Finds", shopName: "Fresh Finds Bazaar",
    trustScore: 40, trustBand: "low", kycStatus: "pending",
    isNew: true, passes: 1, fails: 2,
  });
  const sellers = [priya, rohan, fresh];

  const created: Listing[] = [];
  for (const item of LISTINGS) {
    const listing = await repo.createListing({
      sellerId: sellers[item.seller].id,
      title: item.title,
      description: `${item.title} — quality-checked demo listing from ${sellers[item.seller].shopName}.`,
      price: item.price,
      category: item.category,
      status: item.status,
      flowStep: item.status === "live" ? "live" : item.status,
      verified: item.verified,
      sizeChart: item.sizeChart,
      rankBoost: item.rankBoost,
    });
    created.push(listing);
    await repo.addImage({ listingId: listing.id, url: item.image, imageHash: `seed-${listing.id}`, kind: "catalog" });
    if (item.verified) {
      await repo.addCheck({
        listingId: listing.id, agent: "possession",
        payload: { same_item: true, code_visible: true, matchCount: 3, seeded: true },
        confidence: 0.96, action: "AUTO_APPROVE", requiredConfidence: 0.7,
        reason: "Possession proven against live challenge code (seed).",
      });
      // The orchestrator's own decision record — powers the audit trail + escalation-rate metric.
      await repo.addCheck({
        listingId: listing.id, agent: "orchestrator",
        payload: { signals: { sameItem: true, codeVisible: true, matchConfidence: 0.96 }, seeded: true },
        confidence: 0.96, action: "AUTO_APPROVE", requiredConfidence: 0.7,
        reason: "Above the required bar — auto-approved (seed).",
      });
    } else if (item.status === "blocked") {
      await repo.addCheck({
        listingId: listing.id, agent: "orchestrator",
        payload: { signals: { sameItem: false, matchConfidence: 0.14 }, seeded: true },
        confidence: 0.14, action: "BLOCK", requiredConfidence: 0.8,
        reason: "Possession not proven — listing blocked (seed).",
      });
    }
  }

  // 2 escalated listings → pending reviews with agent context.
  const escalated = created.filter(l => l.status === "escalated");
  for (const listing of escalated) {
    await repo.addCheck({
      listingId: listing.id, agent: "possession",
      payload: { same_item: true, code_visible: false, matchCount: 9, seeded: true },
      confidence: 0.58, action: "ESCALATE_HUMAN", requiredConfidence: 0.8,
      reason: "Challenge code unreadable after max attempts; needs human review.",
    });
    await repo.addCheck({
      listingId: listing.id, agent: "orchestrator",
      payload: { signals: { sameItem: true, codeVisible: false, matchConfidence: 0.58 }, seeded: true },
      confidence: 0.58, action: "ESCALATE_HUMAN", requiredConfidence: 0.8,
      reason: "Below bar after max attempts — escalated to a human (seed).",
    });
    await repo.createReview({ listingId: listing.id, status: "pending" });
    await repo.appendAudit({
      listingId: listing.id, actor: "orchestrator", event: "ESCALATE_HUMAN",
      data: { bar: 0.8, reason: "Out of retries below bar (seed)" },
    });
  }

  // Demo buyer + 1 delivered order (with frozen promise) + 1 placed order.
  const buyer = await repo.createUser({
    auth0Sub: "seed|demo-buyer", email: "buyer@asli.demo", name: "Demo Buyer", role: "buyer",
  });
  const deliveredOn = created[0];
  const delivered = await repo.createOrder({
    listingId: deliveredOn.id, buyerUserId: buyer.id,
    address: { name: "Demo Buyer", line1: "12 MG Road", city: "Pune", pincode: "411001" },
    paymentMethod: "cod", status: "placed",
  });
  await repo.advanceOrder(delivered.id); // shipped
  await repo.advanceOrder(delivered.id); // delivered
  // Match case: delivery photo == frozen catalog (raster JPGs so Agent 4's CLIP/VLM check runs for
  // real; identical bytes also keep the labelled mock in agreement). Promise Keeper ⇒ kept.
  await repo.upsertPromise({
    listingId: deliveredOn.id, orderId: delivered.id,
    frozen: {
      title: deliveredOn.title, price: deliveredOn.price, category: deliveredOn.category,
      sizeChart: deliveredOn.sizeChart, imageUrl: "/mock/delivery/order-catalog.jpg",
    },
    deliveryPhotoUrl: "/mock/delivery/order-catalog.jpg",
  });

  // Mismatch case: a genuinely different delivery photo ⇒ Promise Keeper flags "not as pictured".
  const mismatchOn = created[1];
  const mismatchOrder = await repo.createOrder({
    listingId: mismatchOn.id, buyerUserId: buyer.id,
    address: { name: "Demo Buyer", line1: "12 MG Road", city: "Pune", pincode: "411001" },
    paymentMethod: "cod", status: "placed",
  });
  await repo.advanceOrder(mismatchOrder.id); // shipped
  await repo.advanceOrder(mismatchOrder.id); // delivered
  await repo.upsertPromise({
    listingId: mismatchOn.id, orderId: mismatchOrder.id,
    frozen: {
      title: mismatchOn.title, price: mismatchOn.price, category: mismatchOn.category,
      sizeChart: mismatchOn.sizeChart, imageUrl: "/mock/delivery/order-catalog.jpg",
    },
    deliveryPhotoUrl: "/mock/delivery/order-mismatch.jpg",
  });

  await repo.createOrder({
    listingId: created[2].id, buyerUserId: buyer.id,
    address: { name: "Demo Buyer", line1: "12 MG Road", city: "Pune", pincode: "411001" },
    paymentMethod: "upi_mock", status: "placed",
  });

  // Trust history so Seller 360 sparklines have shape on first load.
  await repo.addTrustEvent({ sellerId: priya.id, delta: 5, reason: "Listing verified", source: "possession" });
  await repo.addTrustEvent({ sellerId: priya.id, delta: 2, reason: "Promise kept on delivery", source: "promise_keeper" });
  await repo.addTrustEvent({ sellerId: rohan.id, delta: -5, reason: "Promise mismatch reported", source: "promise_keeper" });
  await repo.addTrustEvent({ sellerId: fresh.id, delta: -10, reason: "Possession check failed", source: "possession" });

  // Marker last: a crash mid-seed re-runs cleanly.
  await repo.createListing({
    sellerId: priya.id, title: SEED_MARKER, description: "internal seed marker",
    price: 1, category: "sarees", status: "draft", flowStep: "draft",
    verified: false, rankBoost: 0,
  });
}
