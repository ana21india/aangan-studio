import { createHmac, timingSafeEqual } from "node:crypto";

export function sign(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

// Constant-time comparison. An unsigned or wrongly signed request returns false.
export function verifySignature(secret: string | undefined, rawBody: string, received: string | null): boolean {
  if (!secret || !received) return false;
  const expected = Buffer.from(sign(secret, rawBody), "utf8");
  const got = Buffer.from(received.replace(/^sha256=/, ""), "utf8");
  return expected.length === got.length && timingSafeEqual(expected, got);
}
