import type { Config } from "tailwindcss";

// Deck palette — keep in sync with CLAUDE.md.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
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
