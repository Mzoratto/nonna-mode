import { NextResponse } from "next/server";
import { signToken, verifyToken } from "@/server/auth/links";
import { SESSION_COOKIE, SESSION_TTL_S } from "@/server/auth/session";

// Signed link → session cookie → the actor's screen. Identity comes only from the token.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const actor = verifyToken((await params).token);
  const url = new URL(request.url);
  if (!actor) return NextResponse.redirect(new URL("/?signin=expired", url));

  const where =
    actor.t === "PAYER" ? (actor.pid ? `/payments/${actor.pid}` : "/payments")
    : actor.t === "CONTACT" ? (actor.pid ? `/review/${actor.pid}` : "/review")
    : "/admin";
  const res = NextResponse.redirect(new URL(where, url));
  res.cookies.set(SESSION_COOKIE, signToken({ t: actor.t, id: actor.id }, SESSION_TTL_S), {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  return res;
}
