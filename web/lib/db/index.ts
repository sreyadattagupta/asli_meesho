import { InMemoryRepo } from "./inMemoryRepo";
import { SupabaseRepo } from "./supabaseRepo";
import { seedRepo } from "./seed";
import type { Repo } from "./repo";

// Cache on globalThis so the singleton survives Next.js dev HMR AND is shared across route bundles
// (module-level `let` is duplicated per bundle in dev/serverless, which would fork in-memory state).
const globalForRepo = globalThis as unknown as {
  __asliRepo?: Repo;
  __asliRepoReady?: Promise<void>;
  __asliRepoCtor?: unknown;
};

/**
 * Surviving HMR has a catch: edit a repo class and HMR hands us a NEW class object, but the cached
 * INSTANCE still comes from the old one — so a method added in that edit does not exist on it and
 * every route 500s until the dev server is restarted (`repo.listImageMeta is not a function`). The
 * constructor's identity changes on reload, so compare it and rebuild when it moves.
 *
 * Dev only: rebuilding re-runs the seed, which must never happen mid-life in production. There the
 * class object is stable for the process, so this would be a no-op anyway — but scope it explicitly
 * rather than rely on that.
 */
function isStale(Ctor: unknown): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return globalForRepo.__asliRepoCtor !== undefined && globalForRepo.__asliRepoCtor !== Ctor;
}

/** Singleton Repo. In-memory locally, Supabase when DATA_BACKEND=supabase; seeded once per process. */
export function getRepo(): Repo {
  const Ctor = process.env.DATA_BACKEND === "supabase" ? SupabaseRepo : InMemoryRepo;
  if (!globalForRepo.__asliRepo || isStale(Ctor)) {
    globalForRepo.__asliRepo = new Ctor();
    globalForRepo.__asliRepoCtor = Ctor;
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
