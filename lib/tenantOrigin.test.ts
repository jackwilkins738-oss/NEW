import { describe, it, expect } from "vitest";
import { tenantOrigin } from "./tenantOrigin";

describe("tenantOrigin", () => {
  it("uses the tenant's own domain when it has one", () => {
    expect(tenantOrigin({ domain: "dashboard.ridgeviewlofts.co.uk", slug: "ridgeview" })).toBe(
      "https://dashboard.ridgeviewlofts.co.uk",
    );
  });

  it("falls back to the slug subdomain, never the marketing site", () => {
    expect(tenantOrigin({ domain: null, slug: "ridgeview" })).toBe("https://ridgeview.scalardigital.co.uk");
    expect(tenantOrigin({ domain: "  ", slug: "ridgeview" })).toBe("https://ridgeview.scalardigital.co.uk");
  });

  it("falls back to the admin host when nothing is known", () => {
    expect(tenantOrigin(null)).toBe("https://admin.scalardigital.co.uk");
    expect(tenantOrigin({ domain: null, slug: null })).toBe("https://admin.scalardigital.co.uk");
  });
});
