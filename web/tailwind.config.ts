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
        asli: {
          violet: "#8B5CF6",
          pink: "#EC4899",
          amber: "#F59E0B",
          green: "#22C55E",
          ink: "#0B0715",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
