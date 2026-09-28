import { describe, expect, it } from "vitest";
import { dueForChase, type ChaseQuote } from "./quoteChasers";

const DAY = 86_400_000;
const now = Date.parse("2026-10-10T09:00:00Z");
const base: ChaseQuote = {
  status: "sent",
  customer_email: "bill@kerr.co.uk",
  sent_at: new Date(now - 3 * DAY).toISOString(),
  expires_at: "2026-11-01",
  chase_count: 0,
  last_chased_at: null,
};

describe("dueForChase", () => {
  it("chases a sent quote after 3 days, then 4 days after the first chase, then never again", () => {
    expect(dueForChase(base, now, "2026-10-10")).toBe(true);
    expect(dueForChase({ ...base, sent_at: new Date(now - 2 * DAY).toISOString() }, now, "2026-10-10")).toBe(false);
    const chasedOnce = { ...base, chase_count: 1, last_chased_at: new Date(now - 4 * DAY).toISOString() };
    expect(dueForChase(chasedOnce, now, "2026-10-10")).toBe(true);
    expect(dueForChase({ ...chasedOnce, last_chased_at: new Date(now - 3 * DAY).toISOString() }, now, "2026-10-10")).toBe(false);
    expect(dueForChase({ ...chasedOnce, chase_count: 2 }, now, "2026-10-10")).toBe(false);
  });

  it("leaves answered, expired, unsent or email-less quotes alone", () => {
    for (const status of ["accepted", "declined", "draft"]) expect(dueForChase({ ...base, status }, now, "2026-10-10")).toBe(false);
    expect(dueForChase({ ...base, expires_at: "2026-10-09" }, now, "2026-10-10")).toBe(false);
    expect(dueForChase({ ...base, customer_email: null }, now, "2026-10-10")).toBe(false);
    expect(dueForChase({ ...base, sent_at: null }, now, "2026-10-10")).toBe(false);
  });
});
