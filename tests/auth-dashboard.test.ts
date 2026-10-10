import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { makeSessionToken, readSessionToken } from "../src/lib/auth/session";
import { daysIn, monthsTouched, parseRange } from "../src/lib/dashboard/range";
import { hubspotUrl, maskedPhone, minutes } from "../src/lib/dashboard/format";

beforeAll(() => {
  process.env.AUTH_SECRET = "x".repeat(40);
});

describe("passwords", () => {
  it("accepts the right password and rejects wrong ones", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("correct horse");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
  });

  it("salts every hash, so equal passwords look different", async () => {
    expect(await hashPassword("same-password-123")).not.toBe(await hashPassword("same-password-123"));
  });
});

describe("session cookie", () => {
  it("round-trips for the right admin until it expires", () => {
    const now = Date.now();
    const token = makeSessionToken("a@example.com", now);
    expect(readSessionToken(token, now + 1000)).toBe("a@example.com");
    expect(readSessionToken(token, now + 8 * 24 * 3600_000)).toBeNull();
  });

  it("rejects tampered, forged and empty cookies", () => {
    const token = makeSessionToken("a@example.com");
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "evil@example.com", x: Date.now() + 1e9 })).toString("base64url");
    expect(readSessionToken(`${forged}.${sig}`)).toBeNull();
    expect(readSessionToken(`${payload}.deadbeef`)).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
    expect(readSessionToken("garbage")).toBeNull();
  });
});

describe("date ranges (India days)", () => {
  const NOW = new Date("2026-10-09T22:30:00Z"); // 4:00 am IST on 10 Oct

  it("counts today as the Indian day, not the UTC day", () => {
    const r = parseRange({ range: "today" }, NOW);
    expect(r.fromDay).toBe("2026-10-10");
    expect(r.days).toBe(1);
    expect(r.from.toISOString()).toBe("2026-10-09T18:30:00.000Z");
  });

  it("defaults to the last 30 days ending today", () => {
    const r = parseRange({}, NOW);
    expect(r.key).toBe("30d");
    expect(r.days).toBe(30);
    expect(r.toDay).toBe("2026-10-10");
    expect(daysIn(r)).toHaveLength(30);
  });

  it("supports custom dates and ignores nonsense", () => {
    const r = parseRange({ from: "2026-09-01", to: "2026-09-30" }, NOW);
    expect(r.key).toBe("custom");
    expect(r.days).toBe(30);
    expect(parseRange({ from: "2026-09-30", to: "2026-09-01" }, NOW).key).toBe("30d");
    expect(parseRange({ from: "bogus", to: "x" }, NOW).key).toBe("30d");
  });

  it("lists the calendar months a range touches, for fixed plan costs", () => {
    expect(monthsTouched(parseRange({ from: "2026-09-20", to: "2026-11-02" }, NOW))).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(monthsTouched(parseRange({ range: "today" }, NOW))).toEqual(["2026-10"]);
  });
});

describe("display helpers", () => {
  it("masks phone numbers in lists", () => {
    expect(maskedPhone("+919876543210")).toBe("+91******10");
    expect(maskedPhone(null)).toBe("—");
  });
  it("reads times in plain words", () => {
    expect(minutes(0.4)).toBe("under a minute");
    expect(minutes(20)).toBe("20 min");
    expect(minutes(180)).toBe("3.0 hours");
  });
  it("builds HubSpot links only when configured", () => {
    delete process.env.HUBSPOT_PORTAL_ID;
    expect(hubspotUrl("deal", "123")).toBeNull();
    process.env.HUBSPOT_PORTAL_ID = "999";
    process.env.HUBSPOT_APP_URL = "https://app-na2.hubspot.com/";
    expect(hubspotUrl("deal", "123")).toBe("https://app-na2.hubspot.com/contacts/999/record/0-3/123");
    expect(hubspotUrl("contact", "7")).toBe("https://app-na2.hubspot.com/contacts/999/record/0-1/7");
  });
});

describe("public demo mode", () => {
  it("is off unless the switch is exactly 'true'", async () => {
    const { isPublicDemo } = await import("../src/lib/auth/demo");
    delete process.env.DASHBOARD_PUBLIC_DEMO;
    expect(isPublicDemo()).toBe(false);
    for (const v of ["false", "1", "TRUE", "yes", ""]) {
      process.env.DASHBOARD_PUBLIC_DEMO = v;
      expect(isPublicDemo()).toBe(false);
    }
    process.env.DASHBOARD_PUBLIC_DEMO = "true";
    expect(isPublicDemo()).toBe(true);
    delete process.env.DASHBOARD_PUBLIC_DEMO;
  });
});
