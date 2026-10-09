import { describe, expect, it } from "vitest";
import { emailFromIdToken, localPostBody, LOCATION, mapReview } from "./googleBusiness";
import { needsReplyAlert, newReviewEmail } from "./googleSync";

const now = Date.parse("2026-10-09T12:00:00Z");

describe("Google Business Profile", () => {
  it("turns a job post into a Google update with its photo and page", () => {
    const body = localPostBody({
      google_post: "New roof in Didsbury. Get a free quote.",
      title: "New roof",
      page_url: "https://kerr.co.uk/work/new-roof.html",
      photos: [{ url: "https://x.supabase.co/a.jpg" }],
    });
    expect(body).toEqual({
      languageCode: "en-GB",
      topicType: "STANDARD",
      summary: "New roof in Didsbury. Get a free quote.",
      callToAction: { actionType: "LEARN_MORE", url: "https://kerr.co.uk/work/new-roof.html" },
      media: [{ mediaFormat: "PHOTO", sourceUrl: "https://x.supabase.co/a.jpg" }],
    });
    expect(localPostBody({ google_post: "", title: "T", page_url: null, photos: [] })).toEqual({ languageCode: "en-GB", topicType: "STANDARD", summary: "T" });
  });

  it("reads reviews, keeping the reviewer's own words and hiding anonymous names", () => {
    expect(
      mapReview({
        name: "accounts/1/locations/2/reviews/r1",
        reviewer: { displayName: "Sue Smith" },
        starRating: "FOUR",
        comment: "Great job\n\n(Translated by Google)\nGran trabajo",
        createTime: "2026-10-08T10:00:00Z",
        reviewReply: { comment: "Thanks Sue", updateTime: "2026-10-08T12:00:00Z" },
      })
    ).toEqual({
      review_name: "accounts/1/locations/2/reviews/r1",
      reviewer: "Sue Smith",
      star_rating: 4,
      comment: "Great job",
      reviewed_at: "2026-10-08T10:00:00Z",
      reply: "Thanks Sue",
      replied_at: "2026-10-08T12:00:00Z",
    });
    expect(mapReview({ name: "n", reviewer: { displayName: "x", isAnonymous: true }, starRating: "STAR_RATING_UNSPECIFIED" })).toMatchObject({
      reviewer: null,
      star_rating: null,
      comment: null,
    });
  });

  it("only accepts real location names", () => {
    expect(LOCATION.test("accounts/123/locations/456")).toBe(true);
    expect(LOCATION.test("locations/456")).toBe(false);
    expect(LOCATION.test("accounts/1/locations/2/../x")).toBe(false);
  });

  it("reads the account email from the id token", () => {
    const token = `x.${Buffer.from(JSON.stringify({ email: "hello@scalardigital.co.uk" })).toString("base64url")}.y`;
    expect(emailFromIdToken(token)).toBe("hello@scalardigital.co.uk");
    expect(emailFromIdToken("junk")).toBeNull();
    expect(emailFromIdToken(undefined)).toBeNull();
  });

  it("emails only about new, recent, unanswered reviews", () => {
    const r = (name: string, at: string, reply: string | null = null) => ({
      review_name: name, reviewer: "Sue", star_rating: 2, comment: "Late <b>again</b>", reviewed_at: at, reply, replied_at: null,
    });
    const fresh = needsReplyAlert(
      [r("known", "2026-10-08T10:00:00Z"), r("new", "2026-10-08T10:00:00Z"), r("old", "2026-09-01T10:00:00Z"), r("answered", "2026-10-08T10:00:00Z", "Sorry")],
      new Set(["known"]),
      now
    );
    expect(fresh.map((x) => x.review_name)).toEqual(["new"]);
    const email = newReviewEmail("Kerr & Sons", fresh, "https://x/reviews");
    expect(email.subject).toBe("New 2★ Google review from Sue");
    expect(email.html).toContain("Late &lt;b&gt;again&lt;/b&gt;");
    expect(email.html).toContain("disappointed customer");
  });
});
