import { Auth0Client } from "@auth0/nextjs-auth0/server";

// v4: middleware auto-mounts /auth/login, /auth/logout, /auth/callback, /auth/profile.
// Config from env: AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, APP_BASE_URL.

/** True once the Auth0 tenant env vars are filled — until then auth degrades to signed-out. */
export const authConfigured = Boolean(
  process.env.AUTH0_DOMAIN &&
  process.env.AUTH0_CLIENT_ID &&
  process.env.AUTH0_CLIENT_SECRET &&
  process.env.AUTH0_SECRET,
);

export const auth0 = new Auth0Client();
