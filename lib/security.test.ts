import { describe, it, expect, afterEach } from "vitest";
import { tokensMatch } from "./tokens";
import { hasCronSecret } from "./serviceAuth";
import { safeNextPath } from "./safeRedirect";

describe("tokensMatch", () => {
  const t = "3f1c9a2e-7b4d-4e8a-9c1f-2d5e6a7b8c9d";
  it("matches only the identical token", () => {
    expect(tokensMatch(t, t)).toBe(true);
    expect(tokensMatch(t, t.slice(0, -1) + "0")).toBe(false);
    expect(tokensMatch(t, t.slice(0, -1))).toBe(false);
  });
  it("refuses anything that isn't a non-empty string on both sides", () => {
    for (const bad of [undefined, null, "", 123, {}, [t]]) {
      expect(tokensMatch(t, bad)).toBe(false);
      expect(tokensMatch(bad, t)).toBe(false);
    }
  });
});

describe("hasCronSecret", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });
  const req = (auth?: string) => new Request("https://x/api/cron/hourly", { headers: auth ? { authorization: auth } : {} });

  it("accepts the right bearer, even a short secret", () => {
    process.env.CRON_SECRET = "short";
    expect(hasCronSecret(req("Bearer short"))).toBe(true);
    expect(hasCronSecret(req("Bearer shorT"))).toBe(false);
    expect(hasCronSecret(req())).toBe(false);
  });
  it("refuses everything when the secret isn't set - including 'Bearer undefined'", () => {
    delete process.env.CRON_SECRET;
    expect(hasCronSecret(req("Bearer undefined"))).toBe(false);
    expect(hasCronSecret(req("Bearer "))).toBe(false);
    process.env.CRON_SECRET = "";
    expect(hasCronSecret(req("Bearer "))).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("keeps a path on this site", () => {
    expect(safeNextPath("/reset-password")).toBe("/reset-password");
    expect(safeNextPath("/projects/abc?tab=photos")).toBe("/projects/abc?tab=photos");
  });
  it("falls back for anything that could leave the site", () => {
    for (const bad of ["@evil.com", "//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "/x@evil.com", "", null]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });
});
