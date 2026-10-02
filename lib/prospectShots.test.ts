import { describe, expect, it } from "vitest";
import { withoutShots } from "./prospectShots";

describe("withoutShots", () => {
  it("removes the filmstrip and screenshot and keeps everything else", () => {
    const t = { v: 1, checks: { https: true }, logo: "https://a.co.uk/l.png", frames: [], screenshot: "data:x" };
    expect(withoutShots(t)).toEqual({ v: 1, checks: { https: true }, logo: "https://a.co.uk/l.png" });
  });
});
