import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { nextSiteState, type SiteState } from "./siteMonitor";

const up: SiteState = { site_status: "up", site_fail_count: 0, site_down_since: null };
const now = new Date("2026-10-13T10:00:00Z");
const fail = { ok: false, reason: "it didn't answer within 20 seconds" };

describe("site state", () => {
  it("needs two failures in a row before calling it down", () => {
    const once = nextSiteState(up, fail, now);
    expect(once.alert).toBeNull();
    expect(once.state.site_fail_count).toBe(1);
    const twice = nextSiteState(once.state, fail, now);
    expect(twice.alert).toEqual({ kind: "down", text: fail.reason });
    expect(twice.state).toEqual({ site_status: "down", site_fail_count: 2, site_down_since: now.toISOString() });
  });

  it("alerts once while down, then says how long it was out", () => {
    const down: SiteState = { site_status: "down", site_fail_count: 2, site_down_since: "2026-10-13T08:30:00Z" };
    expect(nextSiteState(down, fail, now).alert).toBeNull();
    expect(nextSiteState(down, { ok: true, reason: "" }, now).alert).toEqual({ kind: "up", text: "back up after about 2 hours" });
    const blip = { ...down, site_down_since: "2026-10-13T09:40:00Z" };
    expect(nextSiteState(blip, { ok: true, reason: "" }, now).alert?.text).toBe("back up after about 20 minutes");
  });

  it("a single blip that recovers says nothing", () => {
    const once = nextSiteState(up, fail, now);
    expect(nextSiteState(once.state, { ok: true, reason: "" }, now)).toEqual({ state: up, alert: null });
  });
});
