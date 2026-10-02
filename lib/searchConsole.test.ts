import { generateKeyPairSync, createVerify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { accessToken, assertion, propertiesFor, searchStats, serviceAccount } from "./searchConsole";
import { monthlyReportEmail } from "./monthlyReport";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const SA = { client_email: "report@scalar.iam.gserviceaccount.com", private_key: KEY };

function respond(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

afterEach(() => vi.unstubAllEnvs());

describe("serviceAccount", () => {
  it("reads a JSON key and ignores anything else", () => {
    expect(serviceAccount(JSON.stringify(SA))).toEqual(SA);
    expect(serviceAccount(undefined)).toBeNull();
    expect(serviceAccount("not json")).toBeNull();
    expect(serviceAccount(JSON.stringify({ client_email: "x" }))).toBeNull();
  });
});

describe("assertion", () => {
  it("is a valid RS256 JWT for the read-only Search Console scope", () => {
    const jwt = assertion(SA, 1_790_000_000);
    const [head, claims, sig] = jwt.split(".");
    const verify = createVerify("RSA-SHA256");
    verify.update(`${head}.${claims}`);
    expect(verify.verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    const c = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(c).toMatchObject({ iss: SA.client_email, scope: "https://www.googleapis.com/auth/webmasters.readonly", exp: 1_790_003_600 });
  });

  it("exchanges it for a token, or null when Google refuses", async () => {
    expect(await accessToken(SA, (async () => respond({ access_token: "t" })) as typeof fetch)).toBe("t");
    expect(await accessToken(SA, (async () => respond({}, false)) as typeof fetch)).toBeNull();
  });
});

describe("propertiesFor", () => {
  it("tries the domain property, then www and bare URL prefixes", () => {
    expect(propertiesFor("https://www.Kerr.co.uk/x")).toEqual(["sc-domain:kerr.co.uk", "https://www.kerr.co.uk/", "https://kerr.co.uk/"]);
    expect(propertiesFor("")).toEqual([]);
  });
});

describe("searchStats", () => {
  it("falls through to the property that's shared, and reads last month inclusive", async () => {
    vi.stubEnv("GSC_SERVICE_ACCOUNT_JSON", JSON.stringify(SA));
    const asked: string[] = [];
    const doFetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("oauth2")) return respond({ access_token: "t" });
      asked.push(decodeURIComponent(url));
      if (url.includes("sc-domain")) return respond({}, false); // not shared in that form
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30" });
      return body.dimensions
        ? respond({ rows: [{ keys: ["roofer guildford"], clicks: 12.0, impressions: 300, position: 4 }, { keys: ["x"], clicks: 0, impressions: 9, position: 40 }] })
        : respond({ rows: [{ clicks: 31.4, impressions: 1204.2, position: 9.46 }] });
    }) as typeof fetch;
    const stats = await searchStats("kerr.co.uk", "2026-09-01", "2026-10-01", doFetch);
    expect(stats).toEqual({ clicks: 31, impressions: 1204, position: 9.5, topQueries: [{ query: "roofer guildford", clicks: 12 }] });
    expect(asked[0]).toContain("sc-domain:kerr.co.uk");
    expect(asked[1]).toContain("https://www.kerr.co.uk/");
  });

  it("is null without a key, or when no property is shared", async () => {
    expect(await searchStats("kerr.co.uk", "2026-09-01", "2026-10-01")).toBeNull();
    vi.stubEnv("GSC_SERVICE_ACCOUNT_JSON", JSON.stringify(SA));
    const refuse = (async (url: string) => (url.includes("oauth2") ? respond({ access_token: "t" }) : respond({}, false))) as typeof fetch;
    expect(await searchStats("kerr.co.uk", "2026-09-01", "2026-10-01", refuse)).toBeNull();
  });
});

describe("monthly report with Google figures", () => {
  const base = { visits: 10, enquiries: 1, quotesSent: 0, quotesWon: 0, wonPence: 0, reviews: 0 };
  it("adds an On Google section, escaping search terms", () => {
    const email = monthlyReportEmail("Kerr", "September 2026", {
      ...base, search: { clicks: 31, impressions: 1204, position: 9.5, topQueries: [{ query: "roofer <b>guildford</b>", clicks: 12 }] },
    }, "https://x/dashboard")!;
    expect(email.html).toContain("On Google");
    expect(email.html).toContain("1,204");
    expect(email.html).toContain("&lt;b&gt;guildford");
    expect(email.html).not.toContain("<b>guildford");
  });
  it("leaves it out with no data", () => {
    expect(monthlyReportEmail("Kerr", "September 2026", { ...base, search: null }, "https://x/dashboard")!.html).not.toContain("On Google");
  });
});
