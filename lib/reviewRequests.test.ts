import { describe, expect, it } from "vitest";
import { dueForReviewAsk, reviewEmail, type AskReview } from "./reviewRequests";

const DAY = 86_400_000;
const now = Date.parse("2026-10-10T09:00:00Z");
const ago = (days: number) => new Date(now - days * DAY).toISOString();
const fresh: AskReview = { status: "requested", ask_count: 0, last_asked_at: null };

describe("dueForReviewAsk", () => {
  it("asks 2 days after completion, reminds 7 days later, then never again", () => {
    expect(dueForReviewAsk(fresh, ago(2), now)).toBe(true);
    expect(dueForReviewAsk(fresh, ago(1), now)).toBe(false);
    const askedOnce = { ...fresh, ask_count: 1, last_asked_at: ago(7) };
    expect(dueForReviewAsk(askedOnce, ago(9), now)).toBe(true);
    expect(dueForReviewAsk({ ...askedOnce, last_asked_at: ago(6) }, ago(9), now)).toBe(false);
    expect(dueForReviewAsk({ ...askedOnce, ask_count: 2 }, ago(20), now)).toBe(false);
  });

  it("leaves received reviews, unfinished jobs and old jobs alone", () => {
    expect(dueForReviewAsk({ ...fresh, status: "received" }, ago(3), now)).toBe(false);
    expect(dueForReviewAsk(fresh, null, now)).toBe(false);
    // Switching it on mustn't email every customer from last year.
    expect(dueForReviewAsk(fresh, ago(31), now)).toBe(false);
  });

  it("treats a manual ask as the first one", () => {
    // sendReviewRequestEmail sets ask_count 1: only the reminder can follow.
    expect(dueForReviewAsk({ ...fresh, ask_count: 1, last_asked_at: ago(1) }, ago(3), now)).toBe(false);
  });
});

describe("reviewEmail", () => {
  it("escapes names and the link, and words the reminder differently", () => {
    const first = reviewEmail("<b>Bill</b>", "Kerr & Sons", "https://g.page/r/x/review?a=1&b=2", false);
    expect(first.html).toContain("&lt;b&gt;Bill&lt;/b&gt;");
    expect(first.html).toContain("Kerr &amp; Sons");
    expect(first.html).toContain('href="https://g.page/r/x/review?a=1&amp;b=2"');
    expect(first.subject).toBe("How did we do, <b>Bill</b>?");
    expect(reviewEmail("Bill", "Kerr", "https://x", true).subject).toMatch(/favour/);
  });
});
