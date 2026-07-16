import { InMemoryRepo } from "./inMemoryRepo";
import { SupabaseRepo } from "./supabaseRepo";
import { seedRepo } from "./seed";
import type { Repo } from "./repo";

// Cache on globalThis so the singleton survives Next.js dev HMR AND is shared across route bundles
// (module-level `let` is duplicated per bundle in dev/serverless, which would fork in-memory state).
const globalForRepo = globalThis as unknown as {
  __asliRepo?: Repo;
  __asliRepoReady?: Promise<void>;
  __asliRepoShape?: string;
};

/**
 * The repo class's SHAPE — its method names.
 *
 * Not the constructor's identity: Next dev hands each route bundle its own copy of the class, so
 * identity differs between two perfectly current bundles. Comparing identity rebuilt the repo on
 * almost every navigation, re-running the seed and silently destroying registered users and
 * created listings mid-session — far worse than the stale instance it was meant to catch.
 *
 * Shape distinguishes the two cases: duplicate copies of the same code share a shape, while a class
 * that gained a method in an edit does not.
 */
function shapeOf(Ctor: new () => Repo): string {
  return Object.getOwnPropertyNames(Ctor.prototype).sort().join(",");
}

/**
 * Rebuild only when the code actually changed under us. Editing a repo class leaves the cached
 * INSTANCE built from the old class, so a method added in that edit is missing and every route 500s
 * (`repo.listImageMeta is not a function`) until the dev server restarts.
 *
 * Dev only: a rebuild re-runs the seed, which must never happen mid-life in production.
 */
function isStale(shape: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return globalForRepo.__asliRepoShape !== undefined && globalForRepo.__asliRepoShape !== shape;
}

/** Singleton Repo. In-memory locally, Supabase when DATA_BACKEND=supabase; seeded once per process. */
export function getRepo(): Repo {
  const Ctor = process.env.DATA_BACKEND === "supabase" ? SupabaseRepo : InMemoryRepo;
  const shape = shapeOf(Ctor);
  if (!globalForRepo.__asliRepo || isStale(shape)) {
    globalForRepo.__asliRepo = new Ctor();
    globalForRepo.__asliRepoShape = shape;
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
