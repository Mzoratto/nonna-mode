import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/auth/[token]/route";
import { POST as signOut } from "@/app/auth/sign-out/route";
import { signToken } from "@/server/auth/links";

// Regression (2026-10-17, Render): behind the proxy request.url is http://localhost:10000,
// and redirects built from it sent real users to an unreachable address.
const INTERNAL = "http://localhost:10000";
const PUBLIC = "https://nonna-mode.onrender.com";
let saved: string | undefined;

describe("sign-in redirects behind a proxy", () => {
  beforeEach(() => {
    saved = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = PUBLIC;
    process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123";
  });
  afterEach(() => {
    process.env.APP_BASE_URL = saved;
  });

  it("redirects to the public origin with a Secure session cookie", async () => {
    const token = signToken({ t: "PAYER", id: crypto.randomUUID() }, 60);
    const res = await GET(new Request(`${INTERNAL}/auth/${token}`), { params: Promise.resolve({ token }) });
    expect(res.headers.get("location")).toBe(`${PUBLIC}/payments`);
    expect(res.headers.get("set-cookie")).toMatch(/nm_session=.*Secure.*HttpOnly|nm_session=.*HttpOnly.*Secure/i);
  });

  it("an invalid link also lands on the public origin", async () => {
    const res = await GET(new Request(`${INTERNAL}/auth/bad`), { params: Promise.resolve({ token: "bad" }) });
    expect(res.headers.get("location")).toBe(`${PUBLIC}/?signin=expired`);
  });

  it("sign-out redirects to the public origin", async () => {
    const res = await signOut();
    expect(res.headers.get("location")).toBe(`${PUBLIC}/`);
  });
});
