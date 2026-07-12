import { InMemoryRepo } from "./inMemoryRepo";
import { SupabaseRepo } from "./supabaseRepo";
import { seedRepo } from "./seed";
import type { Repo } from "./repo";

let repo: Repo | undefined;
let ready: Promise<void> | undefined;

/** Singleton Repo. Serverless-safe: module scope per instance, seeded once per instance. */
export function getRepo(): Repo {
  if (!repo) {
    repo = process.env.DATA_BACKEND === "supabase" ? new SupabaseRepo() : new InMemoryRepo();
    ready = seedRepo(repo);
  }
  return repo;
}

/** Await seeding before first use — API routes call this instead of getRepo(). */
export async function repoReady(): Promise<Repo> {
  getRepo();
  await ready;
  return repo!;
}
