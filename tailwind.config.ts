import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Big Shoulders Display"', "system-ui", "sans-serif"],
        sans: ['"Public Sans"', "system-ui", "-apple-system", "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
      },
      colors: {
        page: "var(--page-bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        muted: "var(--muted)",
        brand: "var(--brand)",
        "brand-strong": "var(--brand-strong)",
        "brand-tint": "var(--brand-tint)",
        good: "var(--status-good)",
        warning: "var(--status-warning)",
        critical: "var(--status-critical)",
      },
    },
  },
  plugins: [],
};
export default config;
