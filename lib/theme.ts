// Curated per-tenant brand colors. Deliberately a fixed set, not a free
// color picker: a bad hex choice can fail contrast against white button
// text or clash with the status colors, and there's no validation step in
// /admin to catch that. Each entry is just a base hex - the strong (hover)
// and tint (chip background) variants, plus a lighter dark-mode variant,
// are derived algorithmically below so adding a new option never means
// hand-tuning five more hex values.
//
// "rust" keeps its original hand-tuned values (the ones already shipped
// and looked at) rather than the derived formula, so the existing default
// look doesn't shift under the one customer already using it.
export const PALETTE: Record<string, { name: string; hex: string }> = {
  rust: { name: "Rust", hex: "#8b4a2b" },
  forest: { name: "Forest", hex: "#2f6b4f" },
  navy: { name: "Navy", hex: "#2c4a72" },
  teal: { name: "Teal", hex: "#2f6b6b" },
  plum: { name: "Plum", hex: "#6b3a5e" },
  burgundy: { name: "Burgundy", hex: "#7a2e2e" },
  amber: { name: "Amber", hex: "#a3701f" },
  slate: { name: "Slate", hex: "#3d4a5c" },
};

export const DEFAULT_BRAND_THEME = "rust";

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
  }
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = Math.max(0, Math.min(100, s)) / 100;
  const lN = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export type BrandColors = {
  brand: string;
  brandStrong: string;
  brandTint: string;
};

export function deriveBrandTheme(themeKey: string): { light: BrandColors; dark: BrandColors } {
  if (themeKey === "rust") {
    return {
      light: { brand: "#8b4a2b", brandStrong: "#6e3a20", brandTint: "#f3e2d3" },
      dark: { brand: "#dd925f", brandStrong: "#efb083", brandTint: "rgba(221,146,95,0.14)" },
    };
  }

  const hex = PALETTE[themeKey]?.hex ?? PALETTE[DEFAULT_BRAND_THEME].hex;
  const [h, s, l] = hexToHsl(hex);

  const light: BrandColors = {
    brand: hex,
    brandStrong: hslToHex(h, Math.min(s + 4, 100), Math.max(l - 13, 10)),
    brandTint: hslToHex(h, Math.max(s - 40, 15), Math.min(l + 48, 92)),
  };
  const darkBrand = hslToHex(h, Math.max(s - 10, 25), Math.min(l + 30, 75));
  const dark: BrandColors = {
    brand: darkBrand,
    brandStrong: hslToHex(h, Math.max(s - 8, 25), Math.min(l + 42, 85)),
    brandTint: "rgba(0,0,0,0)", // overridden by callers using darkBrandTintAlpha below
  };
  return { light, dark: { ...dark, brandTint: withAlpha(darkBrand, 0.16) } };
}

function withAlpha(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Inline <style> content that overrides the global --brand tokens for one
// request. Safe to interpolate directly: every value here comes from our
// own PALETTE map or the derivation formula above, never from a raw
// user/DB-supplied string.
//
// Render this with `<style dangerouslySetInnerHTML={{ __html: ... }} />`,
// never `<style>{...}</style>`. The latter looks fine but causes a real
// hydration mismatch: React HTML-escapes plain text children (" becomes
// &quot;), but <style> is an HTML "raw text" element, so the browser's
// parser never decodes that escape back - the DOM ends up with literal
// &quot; characters in the CSS, which won't match what React recomputes
// on the client. dangerouslySetInnerHTML skips the escaping entirely,
// which is what a raw text element like <style> actually needs.
export function brandThemeStyleTag(themeKey: string) {
  const { light, dark } = deriveBrandTheme(themeKey);
  return `
    :root { --brand: ${light.brand}; --brand-strong: ${light.brandStrong}; --brand-tint: ${light.brandTint}; }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) { --brand: ${dark.brand}; --brand-strong: ${dark.brandStrong}; --brand-tint: ${dark.brandTint}; }
    }
    :root[data-theme="dark"] { --brand: ${dark.brand}; --brand-strong: ${dark.brandStrong}; --brand-tint: ${dark.brandTint}; }
  `;
}
