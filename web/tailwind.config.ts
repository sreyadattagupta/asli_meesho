import type { Config } from "tailwindcss";

// Deck palette — keep in sync with CLAUDE.md.
const config: Config = {
  // Every directory that can contain a class name must be listed. A missing glob does not error —
  // the classes are silently purged and the UI renders at browser defaults (a `text-5xl` heading
  // quietly shipping at 16px), which is far harder to spot than a build failure.
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "meesho-pink": "#F43397",
        "meesho-deep": "#9F2089",
        "asli-violet": "#8B5CF6",
        "asli-pink": "#EC4899",
        "asli-amber": "#F59E0B",
        "asli-green": "#22C55E",
        "asli-red": "#EF4444",
        "asli-ink": "#0B0715",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
