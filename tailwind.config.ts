import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Fraunces (variable, optical-size aware) replaces the old bold
        // condensed grotesque for every font-display heading/hero number
        // app-wide - one token swap instead of touching the ~17 files that
        // reference the class, same leverage the shadow/kpi-tile tokens
        // already use elsewhere in this file/globals.css.
        //
        // These reference the CSS variables next/font/google generates
        // (see lib/fonts.ts + app/layout.tsx) rather than the literal family
        // names - the fonts are self-hosted at build time now, not fetched
        // from fonts.googleapis.com at request time.
        display: ["var(--font-fraunces)", "ui-serif", "Georgia", "serif"],
        sans: ["var(--font-public-sans)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
      },
      colors: {
        page: "var(--page-bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        muted: "var(--muted)",
        hairline: "var(--hairline)",
        brand: "var(--brand)",
        "brand-strong": "var(--brand-strong)",
        "brand-tint": "var(--brand-tint)",
        good: "var(--status-good)",
        warning: "var(--status-warning)",
        critical: "var(--status-critical)",
      },
      // Every panel across the app uses shadow-sm - redefining it here (an
      // ambient layer + a tighter key layer + a hairline inset highlight on
      // the top edge, instead of Tailwind's flat single-layer default) lifts
      // every card at once instead of hand-tuning ~28 files individually.
      boxShadow: {
        // Values pull from CSS custom properties (light/dark defined in
        // globals.css) rather than being hardcoded here - this app themes
        // entirely via custom-property swaps under prefers-color-scheme,
        // not Tailwind's dark: variant, so the shadow needs to follow that
        // same mechanism to look right in both themes.
        sm: "0 1px 1px var(--card-shadow-tight), 0 8px 20px -12px var(--card-shadow-ambient), inset 0 1px 0 var(--card-highlight)",
      },
    },
  },
  plugins: [],
};
export default config;
