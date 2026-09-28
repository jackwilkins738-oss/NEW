import { describe, expect, it } from "vitest";
import { projectRef, redirectUrlFor, withRedirectUrl } from "./supabaseRedirects";

describe("supabase redirect URLs", () => {
  it("uses the domain, else the slug address", () => {
    expect(redirectUrlFor({ domain: "dashboard.kerr.co.uk", slug: "kerr" })).toBe("https://dashboard.kerr.co.uk/**");
    expect(redirectUrlFor({ domain: null, slug: "kerr" })).toBe("https://kerr.scalardigital.co.uk/**");
  });

  it("adds a URL once and keeps everything already there", () => {
    expect(withRedirectUrl("https://a.co/**, https://b.co/**", "https://c.co/**")).toBe("https://a.co/**,https://b.co/**,https://c.co/**");
    expect(withRedirectUrl("https://a.co/**,https://c.co/**", "https://c.co/**")).toBe(null);
    expect(withRedirectUrl("", "https://c.co/**")).toBe("https://c.co/**");
    expect(withRedirectUrl(null, "https://c.co/**")).toBe("https://c.co/**");
  });

  it("reads the project ref only from a real Supabase URL", () => {
    expect(projectRef("https://abcdefghijklmnop.supabase.co")).toBe("abcdefghijklmnop");
    expect(projectRef("https://abcdefghijklmnop.supabase.co.evil.com")).toBe(null);
    expect(projectRef(undefined)).toBe(null);
  });
});
