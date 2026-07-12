// English strings — the complete key set. hi.ts fills a Partial of this; missing keys fall back here.
export const en = {
  // app chrome
  "app.tagline": "Real seller. Real product. Real size.",
  "app.wordmark": "असली Asli",

  // nav / auth
  "nav.signin": "Sign in",
  "nav.signout": "Sign out",
  "nav.sell": "Sell",
  "nav.shop": "Shop",
  "nav.admin": "Admin",

  // onboarding
  "onboarding.title": "Choose how you want to explore",
  "onboarding.subtitle": "Pick a persona to enter the demo.",
  "onboarding.seller": "Seller",
  "onboarding.seller.hint": "List a product and prove it's real",
  "onboarding.buyer": "Buyer",
  "onboarding.buyer.hint": "Shop verified listings you can trust",
  "onboarding.admin": "Admin",
  "onboarding.admin.hint": "Review escalations in Trust & Safety",
  "onboarding.disclaimer": "Demo provision: in production, Admin is invite-only and Seller requires KYC.",

  // landing
  "landing.cta.signedout": "Sign in to try the demo",
  "landing.cta.seller": "Go to seller studio",
  "landing.cta.buyer": "Browse the marketplace",
  "landing.cta.admin": "Open Trust & Safety",

  // login
  "login.title": "Sign in to Asli",
  "login.google": "Sign in with Google",
  "login.privacy": "Only your Google name and email are used; all demo data is fictional.",

  // shared states
  "state.loading": "Loading…",
  "state.error": "Something went wrong.",
  "state.retry": "Try again",
} as const;

export type I18nKey = keyof typeof en;
