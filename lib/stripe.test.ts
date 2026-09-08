import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyWebhookSignature, encodeState, decodeState } from "./stripe";

function sign(body: string, secret: string, timestamp: number) {
  const hmac = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${hmac}`;
}

describe("verifyWebhookSignature", () => {
  const secret = "whsec_test_secret";
  const body = JSON.stringify({ type: "checkout.session.completed", data: { object: { metadata: { invoice_id: "abc123" } } } });

  it("accepts a correctly signed payload", () => {
    const header = sign(body, secret, Math.floor(Date.now() / 1000));
    expect(verifyWebhookSignature(body, header, secret)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    const header = sign(body, "wrong_secret", Math.floor(Date.now() / 1000));
    expect(verifyWebhookSignature(body, header, secret)).toBe(false);
  });

  it("rejects a payload that's been tampered with after signing", () => {
    const header = sign(body, secret, Math.floor(Date.now() / 1000));
    const tamperedBody = body.replace("abc123", "someone-elses-invoice");
    expect(verifyWebhookSignature(tamperedBody, header, secret)).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyWebhookSignature(body, "not-a-valid-header", secret)).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyWebhookSignature(body, "", secret)).toBe(false);
  });
});

describe("encodeState / decodeState", () => {
  it("round-trips a state object", () => {
    const state = { tenantId: "tenant-1", returnTo: "https://example.com/settings" };
    const encoded = encodeState(state);
    expect(decodeState(encoded)).toEqual(state);
  });

  it("returns null for garbage input instead of throwing", () => {
    expect(decodeState("not-valid-base64url-json")).toBeNull();
  });
});
