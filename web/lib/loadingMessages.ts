// Copy for the rotating loading messages (lib/useRotatingMessage.ts). Kept as plain data so
// LoadingOverlay stays presentational and the lines are easy to tweak without touching a component.

/** Shown over the upload card while /api/reverse-image runs (~20s). */
export const REVERSE_IMAGE_MESSAGES: string[] = [
  "Window-shopping across Flipkart, Myntra & Amazon…",
  "Peeking behind every marketplace shelf…",
  "Asking Google Lens if it's seen this before…",
  "Flipping through a million catalog pages…",
  "Checking if your kurti has a secret twin…",
  "Dusting off the reverse-image magnifying glass…",
  "Comparing pixels like a very picky shopper…",
  "Almost done haggling with the search engine…",
];

/** Fallback for any nav destination without its own tailored lines (lib/nav.ts). */
export const GENERIC_NAV_MESSAGES: string[] = [
  "Getting things ready…",
  "Almost there…",
  "Fetching the good stuff…",
];
