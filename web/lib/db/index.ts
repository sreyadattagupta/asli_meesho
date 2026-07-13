import { InMemoryRepo } from "./inMemoryRepo";
import { SupabaseRepo } from "./supabaseRepo";
import { seedRepo } from "./seed";
import type { Repo } from "./repo";

// Cache on globalThis so the singleton survives Next.js dev HMR AND is shared across route bundles
// (module-level `let` is duplicated per bundle in dev/serverless, which would fork in-memory state).
const globalForRepo = globalThis as unknown as { __asliRepo?: Repo; __asliRepoReady?: Promise<void> };

/** Singleton Repo. In-memory locally, Supabase when DATA_BACKEND=supabase; seeded once per process. */
export function getRepo(): Repo {
  if (!globalForRepo.__asliRepo) {
    globalForRepo.__asliRepo =
      process.env.DATA_BACKEND === "supabase" ? new SupabaseRepo() : new InMemoryRepo();
    globalForRepo.__asliRepoReady = seedRepo(globalForRepo.__asliRepo);
  }
  return globalForRepo.__asliRepo;
}

/** Await seeding before first use — API routes call this instead of getRepo(). */
export async function repoReady(): Promise<Repo> {
  getRepo();
  await globalForRepo.__asliRepoReady;
  return globalForRepo.__asliRepo!;
}
