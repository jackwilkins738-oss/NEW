import { describe, expect, it } from "vitest";
import { draftReminderEmail, dueForReminder, jobPageCounts, jobsDue, parseDraft, slugify } from "./jobPosts";
import { monthlyReportEmail } from "./monthlyReport";

const HOST = "https://x.supabase.co/storage/v1/object/public/project-photos/";
const now = Date.parse("2026-10-09T12:00:00Z");

describe("job posts", () => {
  it("picks recent finished jobs with photos that have no post yet", () => {
    const jobs = [
      { id: "a", completed_at: "2026-10-01T10:00:00Z", photo_count: 2 },
      { id: "b", completed_at: "2026-10-05T10:00:00Z", photo_count: 0 },
      { id: "c", completed_at: "2026-06-01T10:00:00Z", photo_count: 3 },
      { id: "d", completed_at: null, photo_count: 3 },
      { id: "e", completed_at: "2026-10-07T10:00:00Z", photo_count: 1 },
      { id: "f", completed_at: "2026-10-08T10:00:00Z", photo_count: 1 },
    ];
    expect(jobsDue(jobs, new Set(["f"]), now).map((j) => j.id)).toEqual(["e", "a"]);
  });

  it("makes clean slugs", () => {
    expect(slugify("Slate roof repair in St. Albans!")).toBe("slate-roof-repair-in-st-albans");
    expect(slugify("  ")).toBe("");
  });

  it("checks drafts and keeps only the dashboard's own photos", () => {
    const d = parseDraft(
      {
        project_id: "11111111-2222-3333-4444-555555555555",
        title: "New kitchen in Didsbury",
        body: "Text",
        photos: [{ url: `${HOST}t/1.jpg`, alt: "Kitchen" }, { url: "https://evil.example/x.jpg", alt: "x" }],
      },
      HOST
    );
    expect("error" in d).toBe(false);
    if (!("error" in d)) {
      expect(d.slug).toBe("new-kitchen-in-didsbury");
      expect(d.photos).toEqual([{ url: `${HOST}t/1.jpg`, alt: "Kitchen" }]);
    }
    expect(parseDraft({ project_id: "nope", title: "a", body: "b" }, HOST)).toEqual({ error: "project_id must be a uuid" });
    expect(parseDraft({ project_id: "11111111-2222-3333-4444-555555555555", title: "", body: "b" }, HOST)).toHaveProperty("error");
  });
});

describe("job post reminders and the Growth report", () => {
  it("reminds once, after 3 days", () => {
    expect(dueForReminder({ status: "draft", created_at: "2026-10-05T12:00:00Z", reminded_at: null }, now)).toBe(true);
    expect(dueForReminder({ status: "draft", created_at: "2026-10-07T12:00:00Z", reminded_at: null }, now)).toBe(false);
    expect(dueForReminder({ status: "draft", created_at: "2026-10-01T12:00:00Z", reminded_at: "2026-10-04T12:00:00Z" }, now)).toBe(false);
    expect(dueForReminder({ status: "approved", created_at: "2026-10-01T12:00:00Z", reminded_at: null }, now)).toBe(false);
  });

  it("one email for several drafts, escaped", () => {
    const e = draftReminderEmail("Kerr & Sons", ["Roof <in> Didsbury", "Flat roof"], "https://x/posts");
    expect(e.subject).toBe("2 website posts waiting for you");
    expect(e.html).toContain("Kerr &amp; Sons");
    expect(e.html).toContain("Roof &lt;in&gt; Didsbury");
  });

  it("counts visits and taps on job pages only", () => {
    expect(
      jobPageCounts([
        { path: "/work/a.html", kind: null },
        { path: "/work/b.html", kind: "call" },
        { path: "/work/b.html", kind: "email" },
        { path: "/", kind: null },
        { path: null, kind: "call" },
      ])
    ).toEqual({ visits: 1, taps: 1 });
  });

  it("shows the Growth section with the waiting nudge", () => {
    const none = { visits: 0, enquiries: 0, quotesSent: 0, quotesWon: 0, wonPence: 0, reviews: 0 };
    const growth = { pagesPublished: 2, pagesLive: 5, pageVisits: 40, pageTaps: 3, waiting: 1 };
    const email = monthlyReportEmail("Kerr", "September 2026", { ...none, growth }, "https://x/dashboard")!;
    expect(email.html).toContain("New pages about your finished jobs");
    expect(email.html).toContain("Calls and WhatsApps from job pages");
    expect(email.html).toContain('href="https://x/posts"');
    expect(monthlyReportEmail("Kerr", "September 2026", { ...none, visits: 3 }, "https://x/dashboard")!.html).not.toContain("Growing your local search");
  });
});
