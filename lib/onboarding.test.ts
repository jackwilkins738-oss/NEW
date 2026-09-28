import { describe, expect, it } from "vitest";
import { answeredCount, normaliseAnswers, safeFilename, uploadProblem } from "./onboarding";

describe("normaliseAnswers", () => {
  it("keeps known questions, trimmed and capped, and drops everything else", () => {
    const out = normaliseAnswers({
      services: "Flat roofs\r\nRepairs\n\n\n\nChimneys  ",
      phone: "  01483   111222 ",
      insurance: "Yes",
      domain_login: "Maybe",
      years_trading: "",
      made_up: "x",
      guarantee: 10,
      main_service: "x".repeat(500),
    });
    expect(out).toEqual({
      services: "Flat roofs\nRepairs\n\nChimneys",
      phone: "01483 111222",
      insurance: "Yes",
      main_service: "x".repeat(200),
    });
    expect(answeredCount(out)).toBe(4);
  });

  it("returns nothing for junk", () => {
    expect(normaliseAnswers(null)).toEqual({});
    expect(normaliseAnswers("services")).toEqual({});
  });
});

describe("uploads", () => {
  it("makes names that can't climb folders", () => {
    expect(safeFilename("../../etc/passwd.jpg", "image/jpeg")).toBe("etc-passwd.jpg");
    expect(safeFilename("Our van (2).HEIC", "image/heic")).toBe("Our-van-2.heic");
    expect(safeFilename("....", "application/pdf")).toBe("file.pdf");
  });

  it("refuses the wrong type, size, kind or one file too many", () => {
    const photo = { name: "a.jpg", type: "image/jpeg", size: 2_000_000 };
    expect(uploadProblem(photo, "photo", 0)).toBe(null);
    expect(uploadProblem({ ...photo, type: "image/svg+xml" }, "logo", 0)).toMatch(/only photos/);
    expect(uploadProblem({ ...photo, size: 16 * 1024 * 1024 }, "photo", 0)).toMatch(/15 MB/);
    expect(uploadProblem({ ...photo, size: 0 }, "photo", 0)).toMatch(/15 MB/);
    expect(uploadProblem(photo, "virus", 0)).toMatch(/Unknown/);
    expect(uploadProblem(photo, "photo", 60)).toMatch(/limit/);
  });
});
