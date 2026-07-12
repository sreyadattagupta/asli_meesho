// Seed the deployed Supabase DB: npm run seed
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in web/.env.local (loaded via --env-file).
// Runs on plain Node 22 type-stripping — keep imports type-only or bare except these two.
import { SupabaseRepo } from "./supabaseRepo.ts";
import { seedRepo } from "./seed.ts";

const repo = new SupabaseRepo();
await seedRepo(repo);
const listings = await repo.listListings();
console.log(`Seed complete — ${listings.length} listings in Supabase.`);
