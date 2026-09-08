import { describe, it, expect } from "vitest";
import { deriveBrandTheme, PALETTE, DEFAULT_BRAND_THEME } from "./theme";

describe("deriveBrandTheme", () => {
  it("returns the hand-tuned rust values unchanged", () => {
    const { light, dark } = deriveBrandTheme("rust");
    expect(light.brand).toBe("#a8481f");
    expect(dark.brand).toBe("#e8935e");
  });

  it("derives a light and dark palette for every curated colour", () => {
    for (const key of Object.keys(PALETTE)) {
      const { light, dark } = deriveBrandTheme(key);
      for (const value of [light.brand, light.brandStrong, light.pageBg, light.surface2, dark.brand, dark.brandStrong, dark.pageBg, dark.surface2]) {
        expect(value).toMatch(/^#[0-9a-f]{6}$/i);
      }
      // brandTint is rgba() in dark mode (alpha-blended), not a hex value.
      expect(light.brandTint).toMatch(/^#[0-9a-f]{6}$/i);
      expect(dark.brandTint).toMatch(/^rgba\(/);
    }
  });

  it("falls back to the default theme for an unknown key", () => {
    const unknown = deriveBrandTheme("not-a-real-colour");
    const fallback = deriveBrandTheme(DEFAULT_BRAND_THEME);
    expect(unknown.light.brand).toBe(fallback.light.brand);
  });

  it("uses the tenant's own hue for the base brand colour, not a fixed one", () => {
    const forest = deriveBrandTheme("forest");
    const navy = deriveBrandTheme("navy");
    expect(forest.light.brand).toBe(PALETTE.forest.hex);
    expect(navy.light.brand).toBe(PALETTE.navy.hex);
    expect(forest.light.brand).not.toBe(navy.light.brand);
  });
});
