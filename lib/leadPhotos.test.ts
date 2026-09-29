import { describe, expect, it } from "vitest";
import { claimablePaths, photosProblem } from "./leadPhotos";

const T = "abdc6408-1fd5-4fb6-9c4c-53600b571a6d";
const uuid = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("enquiry photos", () => {
  it("accepts up to five phone photos under 10 MB", () => {
    expect(photosProblem([{ type: "image/jpeg", size: 3_000_000 }, { type: "image/heic", size: 2_000_000 }])).toBeNull();
    expect(photosProblem(Array(6).fill({ type: "image/jpeg", size: 1 }))).toMatch(/Up to 5/);
    expect(photosProblem([{ type: "application/pdf", size: 1 }])).toMatch(/JPG/);
    expect(photosProblem([{ type: "image/png", size: 11 * 1024 * 1024 }])).toMatch(/10 MB/);
    expect(photosProblem([])).toBeTruthy();
    expect(photosProblem("x")).toBeTruthy();
  });

  it("only lets a lead claim its own tenant's pending uploads, once each", () => {
    const mine = `${T}/pending/${uuid}.jpg`;
    expect(claimablePaths(T, [mine, mine, `other-tenant/pending/${uuid}.jpg`, `${T}/pending/../../x.jpg`, `${T}/pending/${uuid}.exe`, 42])).toEqual([mine]);
    expect(claimablePaths(T, "nope")).toEqual([]);
  });
});
